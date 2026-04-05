// src/pages/InvitarTracker.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { useAuthSafe } from "@/context/auth.js";
import useOrgEntitlements from "@/hooks/useOrgEntitlements.js";
import UpgradeToProButton from "@/components/Billing/UpgradeToProButton";

function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function isTruthy(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}

function pickPersonalLabel(row) {
  const nombre = String(row?.nombre || "").trim();
  const apellido = String(row?.apellido || "").trim();
  const email = String(row?.email || "").trim();

  const fullName = [nombre, apellido].filter(Boolean).join(" ").trim();

  if (fullName && email) return `${fullName} — ${email}`;
  return email || fullName || "(sin datos)";
}

function normalizePlanLabel(planCode) {
  const v = String(planCode || "").toLowerCase();
  if (v === "pro") return "PRO";
  if (v === "enterprise") return "ENTERPRISE";
  if (v === "elite_plus") return "ELITE PLUS";
  if (v === "elite") return "ELITE";
  if (v === "starter") return "STARTER";
  if (v === "free") return "FREE";
  return v ? v.toUpperCase() : "—";
}

function formatDateTimeLocal(value) {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

function resolveGeofenceName(assignment, geofenceMap) {
  const id = String(
    assignment?.geocerca_id ||
      assignment?.geofence_id ||
      ""
  ).trim();

  if (!id) return "—";

  const row = geofenceMap.get(id);
  return (
    String(
      row?.nombre ||
        row?.name ||
        row?.label ||
        row?.id ||
        ""
    ).trim() || id
  );
}

function resolveActivityName(assignment, activityMap) {
  const id = String(assignment?.activity_id || "").trim();
  if (!id) return "—";

  const row = activityMap.get(id);
  return (
    String(
      row?.name ||
        row?.nombre ||
        row?.label ||
        row?.id ||
        ""
    ).trim() || id
  );
}

export default function InvitarTracker() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const auth = useAuthSafe();

  const {
    loading: entitlementsLoading,
    error: entitlementsError,
    planCode,
    isFree,
  } = useOrgEntitlements();

  const [busy, setBusy] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  const [people, setPeople] = useState([]);
  const [activeOrgAssignments, setActiveOrgAssignments] = useState([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [assignments, setAssignments] = useState([]);

  const [geofenceMap, setGeofenceMap] = useState(new Map());
  const [activityMap, setActivityMap] = useState(new Map());

  const [okMsg, setOkMsg] = useState(null);
  const [errMsg, setErrMsg] = useState(null);

  const orgId = useMemo(() => {
    const id =
      auth?.orgId ||
      auth?.currentOrgId ||
      auth?.org?.id ||
      auth?.org_id ||
      auth?.currentOrg?.org_id ||
      auth?.currentOrg?.id ||
      "";
    return String(id || "").trim();
  }, [auth]);

  const who = useMemo(() => {
    return {
      email: auth?.user?.email || "",
      user_id: auth?.user?.id || "",
      org_id: orgId,
    };
  }, [auth, orgId]);

  const lang = useMemo(() => {
    try {
      const qp = new URLSearchParams(window.location.search);
      const qlang = String(qp.get("lang") || "").trim().toLowerCase();
      if (qlang === "es" || qlang === "en" || qlang === "fr") return qlang;
    } catch {}
    const l = String(i18n?.resolvedLanguage || i18n?.language || "es")
      .trim()
      .toLowerCase();
    if (l.startsWith("en")) return "en";
    if (l.startsWith("fr")) return "fr";
    return "es";
  }, [i18n]);

  const activeAssignedUserIds = useMemo(() => {
    return new Set(
      (Array.isArray(activeOrgAssignments) ? activeOrgAssignments : [])
        .map((row) => String(row?.tracker_user_id || "").trim())
        .filter(Boolean)
    );
  }, [activeOrgAssignments]);

  const peopleWithActiveAssignments = useMemo(() => {
    const filtered = (Array.isArray(people) ? people : []).filter((row) => {
      const userId = String(row?.user_id || "").trim();
      return userId && activeAssignedUserIds.has(userId);
    });

    filtered.sort((a, b) => pickPersonalLabel(a).localeCompare(pickPersonalLabel(b)));
    return filtered;
  }, [people, activeAssignedUserIds]);

  const activeAssignmentsCount = activeOrgAssignments.length;

  const allowedEmails = useMemo(() => {
    const set = new Set();
    for (const r of peopleWithActiveAssignments) {
      const e = normalizeEmail(r?.email || "");
      if (e) set.add(e);
    }
    return set;
  }, [peopleWithActiveAssignments]);

  const inviteBlockedByPlan = useMemo(() => {
    return !entitlementsLoading && isFree;
  }, [entitlementsLoading, isFree]);

  const hasActiveAssignmentsInOrg = activeAssignmentsCount > 0;


  const selectedPerson = useMemo(() => {
    if (!selectedPersonId) return null;
    return peopleWithActiveAssignments.find((p) => String(p.id) === String(selectedPersonId)) || null;
  }, [peopleWithActiveAssignments, selectedPersonId]);



  // Derive assignment automatically: use the only active assignment if available, otherwise null
  const selectedAssignment = useMemo(() => {
    if (assignments.length === 0) return null;
    return assignments[0];
  }, [assignments]);

  const assignmentPreview = useMemo(() => {
    if (!selectedAssignment) return null;

    return {
      geofenceName: resolveGeofenceName(selectedAssignment, geofenceMap),
      activityName: resolveActivityName(selectedAssignment, activityMap),
      startLabel: formatDateTimeLocal(selectedAssignment.start_time),
      endLabel: formatDateTimeLocal(selectedAssignment.end_time),
    };
  }, [selectedAssignment, geofenceMap, activityMap]);

  const assignmentOptions = useMemo(() => {
    return assignments.map((a) => {
      const geofenceName = resolveGeofenceName(a, geofenceMap);
      const activityName = resolveActivityName(a, activityMap);
      const startLabel = formatDateTimeLocal(a.start_time);
      const endLabel = formatDateTimeLocal(a.end_time);

      return {
        id: a.id,
        label: `${geofenceName} — ${activityName} — ${startLabel} → ${endLabel}`,
      };
    });
  }, [assignments, geofenceMap, activityMap]);

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }

  async function getCallerJwt() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token || "";
    return String(token || "").trim();
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingPeople(true);
      setErrMsg(null);

      if (!orgId) {
        setPeople([]);
        setActiveOrgAssignments([]);
        setLoadingPeople(false);
        setErrMsg(
          t("inviteTracker.errors.noOrg", {
            defaultValue: "No se pudo determinar la organización activa.",
          })
        );
        return;
      }

      if (entitlementsLoading || isFree) {
        setPeople([]);
        setActiveOrgAssignments([]);
        setLoadingPeople(false);
        return;
      }

      try {
        // 1) Cargar personal de la org (base de etiquetas/contacto)
        const { data, error } = await supabase
          .from("personal")
          .select("id, org_id, nombre, apellido, email, vigente, activo, activo_bool, is_deleted, user_id")
          .eq("org_id", orgId)
          .eq("is_deleted", false)
          .limit(500);

        if (cancelled) return;
        if (error) throw error;

        const rows = Array.isArray(data) ? data : [];
        setPeople(rows);

        // 2) Fuente de verdad: tracker_assignments activos en la org actual
        const { data: trackerAssignments, error: taErr } = await supabase
          .from("tracker_assignments")
          .select("tracker_user_id, active")
          .eq("org_id", orgId)
          .eq("active", true)
          .limit(1000);

        if (taErr) throw taErr;

        const safeAssignments = Array.isArray(trackerAssignments) ? trackerAssignments : [];
        setActiveOrgAssignments(safeAssignments);
      } catch (e) {
        if (cancelled) return;
        setPeople([]);
        setActiveOrgAssignments([]);
        setErrMsg(String(e?.message || e));
      } finally {
        if (!cancelled) setLoadingPeople(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [orgId, t, entitlementsLoading, isFree]);

  useEffect(() => {
    if (!selectedPersonId) return;
    const person = peopleWithActiveAssignments.find((p) => String(p.id) === String(selectedPersonId));
    setEmailInput(person?.email || "");
  }, [selectedPersonId, peopleWithActiveAssignments]);

  useEffect(() => {
    let cancelled = false;

    async function loadAssignmentsForPerson() {
      setAssignments([]);
      setGeofenceMap(new Map());
      setActivityMap(new Map());

      if (!orgId || !selectedPerson?.id) return;

      setLoadingAssignments(true);
      setErrMsg(null);

      try {
        const nowIso = new Date().toISOString();
        const { data: rows, error } = await supabase
          .from("asignaciones")
          .select(`
            id,
            org_id,
            personal_id,
            geofence_id,
            geocerca_id,
            activity_id,
            start_time,
            end_time,
            status,
            estado,
            is_deleted
          `)
          .eq("org_id", orgId)
          .eq("personal_id", selectedPerson.id)
          .eq("is_deleted", false)
          .or("status.eq.activa,estado.eq.activa")
          .lte("start_time", nowIso)
          .gte("end_time", nowIso)
          .order("start_time", { ascending: false })
          .limit(100);

        if (error) throw error;
        if (cancelled) return;

        const safeRows = (Array.isArray(rows) ? rows : []);
        setAssignments(safeRows);

        const geofenceIds = Array.from(
          new Set(
            safeRows
              .map((r) => String(r?.geocerca_id || r?.geofence_id || "").trim())
              .filter(Boolean)
          )
        );

        const activityIds = Array.from(
          new Set(
            safeRows
              .map((r) => String(r?.activity_id || "").trim())
              .filter(Boolean)
          )
        );

        if (geofenceIds.length > 0) {
          const { data: geofences, error: geErr } = await supabase
            .from("geocercas")
            .select("id, org_id, name, nombre")
            .eq("org_id", orgId)
            .in("id", geofenceIds);

          if (geErr) throw geErr;
          if (!cancelled) {
            const map = new Map();
            (geofences || []).forEach((g) => map.set(String(g.id), g));
            setGeofenceMap(map);
          }
        }

        if (activityIds.length > 0) {
          const { data: acts, error: actErr } = await supabase
            .from("activities")
            .select("id, org_id, name")
            .eq("org_id", orgId)
            .in("id", activityIds);

          if (actErr) throw actErr;
          if (!cancelled) {
            const map = new Map();
            (acts || []).forEach((a) => map.set(String(a.id), a));
            setActivityMap(map);
          }
        }
      } catch (e) {
        if (cancelled) return;
        setAssignments([]);
        setErrMsg(String(e?.message || e));
      } finally {
        if (!cancelled) setLoadingAssignments(false);
      }
    }

    loadAssignmentsForPerson();
    return () => {
      cancelled = true;
    };
  }, [orgId, selectedPerson]);

  async function onSendInvite(e) {
        if (!selectedAssignment) {
          setErrMsg(
            t("inviteTracker.assignment.noActiveForInvite", {
              defaultValue: "La persona seleccionada no tiene una asignación activa para invitar como tracker.",
            })
          );
          return;
        }
    e.preventDefault();
    setOkMsg(null);
    setErrMsg(null);

    if (inviteBlockedByPlan) {
      setErrMsg(
        t("inviteTracker.errors.planBlocked", {
          defaultValue: "Tu plan actual no permite invitar trackers. Actualiza a PRO o superior.",
        })
      );
      return;
    }

    const cleanEmail = normalizeEmail(emailInput);

    if (!orgId) {
      setErrMsg(
        t("inviteTracker.errors.noOrg", {
          defaultValue: "No se pudo determinar la organización activa.",
        })
      );
      return;
    }

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setErrMsg(
        t("inviteTracker.errors.invalidEmail", {
          defaultValue: "Email inválido.",
        })
      );
      return;
    }

    if (!allowedEmails.has(cleanEmail)) {
      setErrMsg(
        t("inviteTracker.errors.notInOrg", {
          defaultValue: "Ese email no existe en Personal de esta organización.",
        })
      );
      return;
    }



    try {
      setBusy(true);

      const caller_jwt = await getCallerJwt();
      if (!caller_jwt) {
        setErrMsg(
          `${t("inviteTracker.errors.inviteErrorPrefix", {
            defaultValue: "Error invitando",
          })} (401): NO_SESSION (client)`
        );
        return;
      }

      const name = selectedPerson
        ? [String(selectedPerson?.nombre || "").trim(), String(selectedPerson?.apellido || "").trim()]
            .filter(Boolean)
            .join(" ")
            .trim()
        : "";

      const payload = {
        email: cleanEmail,
        org_id: orgId,
        role: "tracker",
        lang,
        name,
        caller_jwt,
        assignment_id: selectedAssignment ? selectedAssignment.id : null,
      };

      const res = await fetch("/api/invite-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const text = await res.text().catch(() => "");
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { raw: text };
      }

      if (!res.ok) {
        // Manejo especial para personal_user_id_conflict
        if (body?.error === "personal_user_id_conflict") {
          setErrMsg(
            t("inviteTracker.errors.personalUserIdConflict", {
              defaultValue:
                "El registro de personal ya tiene un usuario asignado. Si deseas invitar a otro usuario, primero desvincula el usuario actual desde la administración de Personal.",
            })
          );
          return;
        }
        const msg = body?.error || body?.message || body?.raw || `HTTP ${res.status}`;
        setErrMsg(
          `${t("inviteTracker.errors.inviteErrorPrefix", {
            defaultValue: "Error invitando",
          })} (${res.status}): ${msg}`
        );
        return;
      }

      if (body && body.ok === false) {
        const upstreamStatus = body?.upstream_status || body?._proxy?.edge_status || "?";
        const upstreamMsg =
          body?.upstream?.error ||
          body?.error ||
          body?.message ||
          body?._proxy?.edge_raw_sample ||
          "UPSTREAM_ERROR";
        setErrMsg(
          `${t("inviteTracker.errors.inviteErrorPrefix", {
            defaultValue: "Error invitando",
          })} (${upstreamStatus}): ${upstreamMsg}`
        );
        return;
      }

      const actionLink = body?.action_link || "";
      const emailSent = body?.email_sent;
      const details = body?.assignment_details || null;

      let msg = t("inviteTracker.ok.generated", {
        defaultValue: "Invitación generada para {{email}}.",
        email: cleanEmail,
      });

      if (emailSent === true) {
        msg += ` ${t("inviteTracker.ok.emailSent", { defaultValue: "Email enviado." })}`;
      }
      if (emailSent === false && actionLink) {
        msg += ` ${t("inviteTracker.ok.fallbackLink", { defaultValue: "Copia el enlace manualmente." })}`;
      }

      setOkMsg({
        msg,
        actionLink,
        diag: body?._proxy || body?.diag || null,
        details,
      });
    } catch (e2) {
      setErrMsg(String(e2?.message || e2));
    } finally {
      setBusy(false);
    }
  }

  const selectPlaceholder = loadingPeople
    ? t("common.actions.loading", { defaultValue: "Cargando…" })
    : peopleWithActiveAssignments.length === 0
      ? t("inviteTracker.empty.noActiveAssignments", { defaultValue: "Sin personal con asignación activa" })
      : t("common.select", { defaultValue: "— Selecciona —" });

  const assignmentPlaceholder = loadingAssignments
    ? t("common.actions.loading", { defaultValue: "Cargando…" })
    : !selectedPerson
      ? t("inviteTracker.assignment.selectPersonFirst", { defaultValue: "Primero selecciona una persona" })
      : assignments.length === 0
        ? t("inviteTracker.assignment.noAssignments", { defaultValue: "Sin asignaciones activas" })
        : t("inviteTracker.assignment.select", { defaultValue: "— Selecciona una asignación —" });

  if (entitlementsLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="w-full max-w-2xl rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">
            {t("inviteTracker.title", { defaultValue: "Invitar tracker" })}
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            {t("inviteTracker.plan.validating", {
              defaultValue: "Validando plan de la organización...",
            })}
          </p>
        </div>
      </div>
    );
  }

  if (entitlementsError) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="w-full max-w-2xl rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">
            {t("inviteTracker.title", { defaultValue: "Invitar tracker" })}
          </h1>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {t("inviteTracker.plan.validationError", {
              defaultValue: "No se pudo validar el plan de la organización.",
            })}
            <div className="mt-2 break-all font-mono text-xs">{entitlementsError}</div>
          </div>
        </div>
      </div>
    );
  }

  if (inviteBlockedByPlan) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="w-full max-w-2xl rounded-2xl border bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-semibold text-gray-900">
              {t("inviteTracker.title", { defaultValue: "Invitar tracker" })}
            </h1>

            <button
              type="button"
              onClick={() => navigate("/tracker")}
              className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50 text-slate-800"
            >
              {t("inviteTracker.backToTracker", { defaultValue: "Volver a Tracker" })}
            </button>
          </div>

          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <div className="text-base font-semibold">
              {t("inviteTracker.plan.requiresProTitle", {
                defaultValue: "Esta función requiere PRO o superior.",
              })}
            </div>
            <div className="mt-2 text-sm">
              {t("inviteTracker.plan.detectedPlan", { defaultValue: "Plan detectado" })}:{" "}
              <span className="font-semibold">{normalizePlanLabel(planCode)}</span>
            </div>
            <div className="mt-1 text-sm">
              {t("inviteTracker.diag.orgUsed", { defaultValue: "Org usada" })}:{" "}
              <span className="font-mono">{who.org_id || "—"}</span>
            </div>
            <div className="mt-3 text-sm">
              {t("inviteTracker.plan.freeBlockedBody", {
                defaultValue: "El plan FREE no permite invitar nuevos trackers a la organización.",
              })}
            </div>
          </div>

          {orgId ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm text-gray-700 mb-3">
                {t("inviteTracker.plan.upgradePrompt", {
                  defaultValue: "Actualiza esta organización para habilitar invitaciones de trackers.",
                })}
              </div>
              <UpgradeToProButton
                orgId={orgId}
                getAccessToken={getAccessToken}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-gray-900">
            {t("inviteTracker.title", { defaultValue: "Invitar tracker" })}
          </h1>

          <button
            type="button"
            onClick={() => navigate("/tracker")}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50 text-slate-800"
          >
            {t("inviteTracker.backToTracker", { defaultValue: "Volver a Tracker" })}
          </button>
        </div>

        <div className="mt-4 rounded-xl border bg-slate-50 p-3 text-xs text-slate-700">
          <div>
            <b>{t("inviteTracker.diag.orgUsed", { defaultValue: "Org usada" })}:</b>{" "}
            {who.org_id || "—"}
          </div>
          <div>
            <b>{t("inviteTracker.diag.user", { defaultValue: "Usuario" })}:</b>{" "}
            {who.email || "—"} ({who.user_id || "—"})
          </div>
          <div className="mt-1">
            <b>{t("inviteTracker.diag.membersLoaded", { defaultValue: "Personal cargado" })}:</b>{" "}
            {loadingPeople ? t("common.actions.loading", { defaultValue: "Cargando…" }) : String(peopleWithActiveAssignments.length)}
          </div>
          <div className="mt-1">
            <b>{t("inviteTracker.assignment.activeLoaded", { defaultValue: "Asignaciones activas (base dropdown)" })}:</b>{" "}
            {loadingPeople ? t("common.actions.loading", { defaultValue: "Cargando…" }) : String(activeAssignmentsCount)}
          </div>
        </div>

        {errMsg && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errMsg}
          </div>
        )}

        {okMsg && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            <div>{okMsg.msg}</div>

            {okMsg.details ? (
              <div className="mt-3 rounded-lg border border-green-200 bg-white p-3 text-xs text-slate-800">
                <div className="font-semibold mb-2">
                  {t("inviteTracker.assignment.sentDetail", { defaultValue: "Detalle enviado en el email" })}
                </div>
                <div><b>{t("inviteTracker.assignment.window", { defaultValue: "Ventana asignada" })}:</b> {okMsg.details?.timeWindow || "—"}</div>
                <div><b>{t("inviteTracker.assignment.geofence", { defaultValue: "Geocerca asignada" })}:</b> {okMsg.details?.geofenceName || "—"}</div>
                <div><b>{t("inviteTracker.assignment.task", { defaultValue: "Tarea asignada" })}:</b> {okMsg.details?.taskName || "—"}</div>
              </div>
            ) : null}

            {okMsg.actionLink ? (
              <div className="mt-2 text-xs text-slate-700">
                <div className="font-semibold">
                  {t("inviteTracker.ok.magicLinkFallback", { defaultValue: "Enlace alterno (manual)" })}:
                </div>
                <div className="mt-1 break-all rounded-lg border bg-white p-2">
                  {okMsg.actionLink}
                </div>
              </div>
            ) : null}
          </div>
        )}

        <form onSubmit={onSendInvite} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900">
              {t("inviteTracker.selectPersonLabel", { defaultValue: "Selecciona una persona" })}
            </label>

            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 bg-white text-gray-900"
              value={selectedPersonId}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedPersonId(v);
                const person = peopleWithActiveAssignments.find((p) => String(p.id) === String(v));
                setEmailInput(person?.email || "");
                setOkMsg(null);
                setErrMsg(null);
              }}
              disabled={loadingPeople || !hasActiveAssignmentsInOrg || peopleWithActiveAssignments.length === 0}
            >
              <option value="">{selectPlaceholder}</option>
              {peopleWithActiveAssignments.map((p) => (
                <option key={p.id} value={p.id}>
                  {pickPersonalLabel(p)}
                </option>
              ))}
            </select>

            <p className="mt-2 text-xs text-slate-600">
              {t("inviteTracker.onlyActiveAssignmentsNote", {
                defaultValue: "Solo aparecen personas de esta organización con asignación activa real.",
              })}{" "}
              <b>{t("inviteTracker.assignment.activeSource", { defaultValue: "Fuente: tracker_assignments (active=true)" })}</b>.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900">
              {t("inviteTracker.emailLabel", { defaultValue: "Email" })}
            </label>

            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring bg-white text-gray-900"
              type="email"
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value);
                setOkMsg(null);
                setErrMsg(null);
              }}
              placeholder={t("inviteTracker.emailPlaceholder", { defaultValue: "tracker@ejemplo.com" })}
              autoComplete="email"
            />
          </div>


      {/* Assignment select and preview removed: assignment is now derived automatically from selected person */}

          <button
            type="submit"
            disabled={busy || loadingPeople || !orgId || !hasActiveAssignmentsInOrg}
            className={[
              "w-full rounded-xl px-4 py-3 text-sm font-semibold",
              busy || loadingPeople || !orgId || !hasActiveAssignmentsInOrg
                ? "bg-slate-300 text-slate-600 cursor-not-allowed"
                : "bg-black text-white hover:bg-slate-900",
            ].join(" ")}
          >
            {busy
              ? t("common.sending", { defaultValue: "Enviando…" })
              : t("inviteTracker.sendInvite", { defaultValue: "Enviar invitación" })}
          </button>
        </form>
      </div>
    </div>
  );
}