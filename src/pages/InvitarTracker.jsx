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

function pickPersonalLabel(row) {
  const nombre = String(row?.nombre || "").trim();
  const apellido = String(row?.apellido || "").trim();
  const email = String(row?.email || "").trim();
  const fullName = [nombre, apellido].filter(Boolean).join(" ").trim();

  if (fullName && email) return `${fullName} - ${email}`;
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
  return v ? v.toUpperCase() : "-";
}

export default function InvitarTracker() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const auth = useAuthSafe();

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

  const {
    loading: entitlementsLoading,
    error: entitlementsError,
    planCode,
    normalizedPlanStatus,
    isActive,
    maxTrackers,
    entitlements,
  } = useOrgEntitlements();

  // Always use optional chaining and fallback for entitlements
  const planStatus = entitlements?.plan_status ?? null;

  // Show loader or sync message if either auth or entitlements are loading
  if (auth.loading || entitlementsLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="w-full max-w-2xl rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">
            {t("inviteTracker.title", { defaultValue: "Invitar tracker" })}
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            {t("inviteTracker.org.syncing", {
              defaultValue: "Sincronizando organización y plan...",
            })}
          </p>
        </div>
      </div>
    );
  }

  const [busy, setBusy] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [people, setPeople] = useState([]);
  const [activeAssignaciones, setActiveAssignaciones] = useState([]);

  const [trackerCount, setTrackerCount] = useState(0);
  const [loadingTrackerCount, setLoadingTrackerCount] = useState(true);

  const [selectedPersonKey, setSelectedPersonKey] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [okMsg, setOkMsg] = useState(null);
  const [errMsg, setErrMsg] = useState(null);

  const [inviteLink, setInviteLink] = useState("");
  const [inviteMeta, setInviteMeta] = useState(null);

  const lang = useMemo(() => {
    try {
      const qp = new URLSearchParams(window.location.search);
      const qlang = String(qp.get("lang") || "")
        .trim()
        .toLowerCase();

      if (qlang === "es" || qlang === "en" || qlang === "fr") return qlang;
    } catch {
      // no-op
    }

    const l = String(i18n?.resolvedLanguage || i18n?.language || "es")
      .trim()
      .toLowerCase();

    if (l.startsWith("en")) return "en";
    if (l.startsWith("fr")) return "fr";
    return "es";
  }, [i18n]);

  const hasActiveAssignmentsInOrg = activeAssignaciones.length > 0;

  const inviteBlockedByPlan = useMemo(() => {
    // Final protection: block only if planStatus is not active
    return !entitlementsLoading && (!planStatus || planStatus !== "active");
  }, [entitlementsLoading, planStatus]);

  const trackerLimitReached = useMemo(() => {
    return !loadingTrackerCount && trackerCount >= maxTrackers;
  }, [loadingTrackerCount, trackerCount, maxTrackers]);

  const trackersUsageLabel = useMemo(() => {
    if (loadingTrackerCount) return "…";
    return `${trackerCount} / ${maxTrackers}`;
  }, [loadingTrackerCount, trackerCount, maxTrackers]);

  const activeAssignmentByPersonId = useMemo(() => {
    const map = new Map();

    for (const assignment of activeAssignaciones) {
      const personId = String(assignment?.personal_id || "").trim();
      if (personId) {
        map.set(personId, assignment);
      }
    }

    return map;
  }, [activeAssignaciones]);

  const peopleWithActiveAssignments = useMemo(() => {
    const filtered = people.filter((p) => {
      const personId = String(p?.id || "").trim();
      return personId && activeAssignmentByPersonId.has(personId);
    });

    filtered.sort((a, b) =>
      pickPersonalLabel(a).localeCompare(pickPersonalLabel(b))
    );

    return filtered;
  }, [people, activeAssignmentByPersonId]);

  const inviteOptions = useMemo(() => {
    return peopleWithActiveAssignments.map((p) => {
      const key = String(p?.id || "").trim();
      return {
        key,
        person: p,
        label: pickPersonalLabel(p),
      };
    });
  }, [peopleWithActiveAssignments]);

  const selectedOption = useMemo(() => {
    return inviteOptions.find((opt) => opt.key === selectedPersonKey) || null;
  }, [inviteOptions, selectedPersonKey]);

  const selectedPerson = useMemo(() => {
    if (!selectedPersonKey) return null;
    return (
      people.find((p) => String(p?.id || "").trim() === selectedPersonKey) ||
      null
    );
  }, [people, selectedPersonKey]);

  const selectedAssignment = useMemo(() => {
    if (!selectedPerson) return null;

    const personId = String(selectedPerson?.id || "").trim();
    return personId ? activeAssignmentByPersonId.get(personId) || null : null;
  }, [activeAssignmentByPersonId, selectedPerson]);

  const allowedEmails = useMemo(() => {
    const set = new Set();

    for (const p of peopleWithActiveAssignments) {
      const e = normalizeEmail(p?.email);
      if (e) set.add(e);
    }

    return set;
  }, [peopleWithActiveAssignments]);

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }

  async function getCallerJwt() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return String(data?.session?.access_token || "").trim();
  }

  useEffect(() => {
    let cancelled = false;

    async function loadTrackerCount() {
      if (!orgId) {
        if (!cancelled) {
          setTrackerCount(0);
          setLoadingTrackerCount(false);
        }
        return;
      }

      try {
        setLoadingTrackerCount(true);

        const { count, error } = await supabase
          .from("memberships")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("role", "tracker")
          .is("revoked_at", null);

        if (error) {
          throw error;
        }

        if (!cancelled) {
          setTrackerCount(count || 0);
        }
      } catch (e) {
        console.error("[invite-tracker] tracker count error", e);
        if (!cancelled) {
          setTrackerCount(0);
        }
      } finally {
        if (!cancelled) {
          setLoadingTrackerCount(false);
        }
      }
    }

    loadTrackerCount();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;

    async function loadInviteSources() {
      setLoadingPeople(true);
      setErrMsg(null);

      if (!orgId) {
        setPeople([]);
        setActiveAssignaciones([]);
        setLoadingPeople(false);
        setErrMsg(
          t("inviteTracker.errors.noOrg", {
            defaultValue: "No se pudo determinar la organización activa.",
          })
        );
        return;
      }

      if (entitlementsLoading || !planStatus || planStatus !== "active") {
        setPeople([]);
        setActiveAssignaciones([]);
        setLoadingPeople(false);
        return;
      }

      try {
        const now = new Date().toISOString();

        const { data: assignacionesRows, error: assignacionesErr } =
          await supabase
            .from("asignaciones")
            .select("id, org_id, personal_id, user_id")
            .eq("org_id", orgId)
            .eq("is_deleted", false)
            .eq("estado", "activa")
            .lte("start_time", now)
            .gte("end_time", now)
            .limit(1000);

        if (assignacionesErr) throw assignacionesErr;
        if (cancelled) return;

        const activePersonIds = Array.from(
          new Set(
            (assignacionesRows || [])
              .map((a) => String(a?.personal_id || "").trim())
              .filter(Boolean)
          )
        );

        let pRows = [];
        if (activePersonIds.length > 0) {
          const { data: peopleRows, error: pErr } = await supabase
            .from("personal")
            .select("id, org_id, nombre, apellido, email, user_id, is_deleted")
            .eq("org_id", orgId)
            .eq("is_deleted", false)
            .in("id", activePersonIds)
            .limit(500);

          if (pErr) throw pErr;
          pRows = peopleRows || [];
        }

        if (cancelled) return;

        setPeople(Array.isArray(pRows) ? pRows : []);
        setActiveAssignaciones(
          Array.isArray(assignacionesRows) ? assignacionesRows : []
        );
      } catch (e) {
        if (cancelled) return;
        setPeople([]);
        setActiveAssignaciones([]);
        setErrMsg(String(e?.message || e));
      } finally {
        if (!cancelled) setLoadingPeople(false);
      }
    }

    loadInviteSources();

    return () => {
      cancelled = true;
    };
  }, [orgId, entitlementsLoading, isActive, t]);

  useEffect(() => {
    if (!selectedPerson) {
      setEmailInput("");
      return;
    }
    setEmailInput(String(selectedPerson?.email || ""));
  }, [selectedPerson]);

  async function onSendInvite(e) {
    e.preventDefault();
    setOkMsg(null);
    setErrMsg(null);

    if (inviteBlockedByPlan) {
      setErrMsg(
        t("inviteTracker.errors.planBlocked", {
          defaultValue:
            "Tu organización no tiene un plan activo para invitar trackers.",
        })
      );
      return;
    }

    if (trackerLimitReached) {
      setErrMsg(
        t("inviteTracker.errors.trackerLimitReached", {
          defaultValue:
            "Tu organización alcanzó el límite de {{count}} trackers para el plan {{plan}}.",
          count: maxTrackers,
          plan: String(planCode || "free").toUpperCase(),
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

    if (!selectedPerson) {
      setErrMsg(
        t("inviteTracker.errors.noPerson", {
          defaultValue: "Selecciona una persona con asignación activa.",
        })
      );
      return;
    }

    if (!selectedAssignment?.id) {
      setErrMsg(
        t("inviteTracker.assignment.noActiveForInvite", {
          defaultValue:
            "La persona seleccionada no tiene asignación activa en esta organización.",
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
          defaultValue:
            "Ese email no existe en personal con asignación activa en esta organización.",
        })
      );
      return;
    }

    try {
      setBusy(true);
      setInviteLink("");
      setInviteMeta(null);

      const callerJwt = await getCallerJwt();
      if (!callerJwt) {
        setErrMsg("NO_SESSION");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || "";

      console.log("[invite-create] has access token", !!accessToken);

      const res = await fetch("/api/invite-tracker", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          org_id: orgId,
          email: cleanEmail,
        }),
      });

      const body = await res.json().catch(() => null);

      console.log("[invite-create] fresh response", body);

      if (body?.invite_url && body?.invite_id) {
        setInviteLink(body.invite_url);
        setInviteMeta({
          invite_id: body.invite_id,
          created_at: body.created_at,
          invite_url: body.invite_url,
        });
      } else {
        setInviteLink("");
        setInviteMeta(null);
      }

      if (!res.ok || body?.ok === false) {
        const msg = body?.error || body?.message || `HTTP ${res.status}`;
        setErrMsg(String(msg));
        return;
      }

      setOkMsg(
        t("inviteTracker.ok.generated", {
          defaultValue: "Invitación generada para {{email}}.",
          email: cleanEmail,
        })
      );
    } catch (e2) {
      setErrMsg(String(e2?.message || e2));
    } finally {
      setBusy(false);
    }
  }

  const selectPlaceholder = loadingPeople
    ? t("common.actions.loading", { defaultValue: "Cargando..." })
    : inviteOptions.length === 0
      ? t("inviteTracker.empty.noActiveAssignments", {
          defaultValue: "Sin personal con asignación activa",
        })
      : t("common.select", { defaultValue: "- Selecciona -" });

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
              defaultValue:
                "No se pudo validar el plan de la organización.",
            })}
            <div className="mt-2 break-all font-mono text-xs">
              {entitlementsError}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (inviteBlockedByPlan) {
    let blockMsg = null;
    if (planCode === "pro" && (!planStatus || planStatus !== "active")) {
      blockMsg = (
        <>
          <div className="mt-2 text-sm">
            {t("inviteTracker.plan.detectedPlan", { defaultValue: "Plan detectado" })}: <span className="font-semibold">PRO</span>
          </div>
          <div className="mt-2 text-sm">
            {t("inviteTracker.plan.statusLabel", { defaultValue: "Estado del plan" })}: <span className="font-semibold">{t(`status.${normalizedPlanStatus}`, { defaultValue: normalizedPlanStatus })}</span>
          </div>
          <div className="mt-3 text-sm">
            {t("inviteTracker.plan.proInactiveBlockedBody", {
              defaultValue: "Las invitaciones de tracker requieren una suscripción PRO activa.",
            })}
          </div>
        </>
      );
    } else if (planCode === "free") {
      blockMsg = (
        <>
          <div className="mt-2 text-sm">
            {t("inviteTracker.plan.detectedPlan", { defaultValue: "Plan detectado" })}: <span className="font-semibold">FREE</span>
          </div>
          <div className="mt-3 text-sm">
            {t("inviteTracker.plan.freeBlockedBody", {
              defaultValue: "Las invitaciones de tracker no están disponibles en el plan FREE actual.",
            })}
          </div>
        </>
      );
    } else {
      blockMsg = (
        <>
          <div className="mt-2 text-sm">
            {t("inviteTracker.plan.detectedPlan", { defaultValue: "Plan detectado" })}: <span className="font-semibold">{normalizePlanLabel(planCode)}</span>
          </div>
          <div className="mt-2 text-sm">
            {t("inviteTracker.plan.statusLabel", { defaultValue: "Estado del plan" })}: <span className="font-semibold">{t(`status.${planStatus}`, { defaultValue: planStatus ?? "-" })}</span>
          </div>
          <div className="mt-3 text-sm">
            {t("inviteTracker.plan.genericBlockedBody", {
              defaultValue: "Las invitaciones de tracker requieren una suscripción activa compatible.",
            })}
          </div>
        </>
      );
    }
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
              {t("inviteTracker.plan.requiresProTitle", { defaultValue: "Esta función requiere PRO o superior." })}
            </div>
            {blockMsg}
          </div>
          {orgId ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm text-gray-700 mb-3">
                {t("inviteTracker.plan.upgradePrompt", { defaultValue: "Actualiza esta organización para habilitar invitaciones de trackers." })}
              </div>
              <UpgradeToProButton orgId={orgId} getAccessToken={getAccessToken} />
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
            {t("inviteTracker.backToTracker", {
              defaultValue: "Volver a Tracker",
            })}
          </button>
        </div>

        {errMsg ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errMsg}
          </div>
        ) : null}

        {okMsg ? (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {okMsg}
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                {t("inviteTracker.usage.title", {
                  defaultValue: "Uso de trackers",
                })}
              </div>
              <div className="mt-1 text-sm text-slate-700">
                {t("inviteTracker.usage.current", {
                  defaultValue: "Usados: {{used}} / {{max}}",
                  used: trackerCount,
                  max: maxTrackers,
                })}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {t("inviteTracker.usage.plan", {
                  defaultValue: "Plan: {{plan}} · Estado: {{status}}",
                  plan: normalizePlanLabel(planCode),
                  status: String(planStatus || "free").toUpperCase(),
                })}
              </div>
            </div>

            <div className="text-sm">
              {loadingTrackerCount ? (
                <span className="text-slate-500">
                  {t("inviteTracker.usage.loading", {
                    defaultValue: "Calculando uso…",
                  })}
                </span>
              ) : trackerLimitReached ? (
                <span className="font-medium text-amber-700">
                  {t("inviteTracker.usage.limitReached", {
                    defaultValue: "Límite alcanzado",
                  })}
                </span>
              ) : (
                <span className="font-medium text-emerald-700">
                  {t("inviteTracker.usage.available", {
                    defaultValue: "Cupo disponible",
                  })}
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-900 transition-all"
              style={{
                width:
                  maxTrackers > 0
                    ? `${Math.min(
                        100,
                        Math.round((trackerCount / maxTrackers) * 100)
                      )}%`
                    : "0%",
              }}
            />
          </div>

          {!isActive || trackerLimitReached ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm text-slate-700 mb-3">
                {!isActive
                  ? t("inviteTracker.usage.upgradeInactive", {
                      defaultValue:
                        "Activa un plan PRO o superior para invitar trackers.",
                    })
                  : t("inviteTracker.usage.upgradeLimit", {
                      defaultValue:
                        "Tu plan actual llegó al límite. Actualiza para agregar más trackers.",
                    })}
              </div>

              {orgId ? (
                <UpgradeToProButton
                  orgId={orgId}
                  getAccessToken={getAccessToken}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <form onSubmit={onSendInvite} className="mt-6 space-y-4">
          {inviteLink && inviteMeta ? (
            <div className="mt-4 flex flex-col gap-2">
              <div className="text-xs text-slate-700 break-all">
                <b>Enlace de invitación:</b> <span>{inviteLink}</span>
              </div>
              <div className="text-xs text-slate-700 break-all">
                <b>invite_id:</b> <span>{inviteMeta.invite_id}</span>
                <br />
                <b>created_at:</b> <span>{inviteMeta.created_at}</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded bg-blue-600 text-white px-3 py-1 text-xs font-semibold hover:bg-blue-700"
                  onClick={() => {
                    if (inviteMeta?.invite_url) {
                      console.log("[invite-open] using", {
                        invite_id: inviteMeta.invite_id,
                        created_at: inviteMeta.created_at,
                        invite_url: inviteMeta.invite_url,
                      });
                      navigator.clipboard.writeText(inviteMeta.invite_url);
                    }
                  }}
                >
                  Copiar enlace
                </button>
                <button
                  type="button"
                  className="rounded bg-green-600 text-white px-3 py-1 text-xs font-semibold hover:bg-green-700"
                  onClick={() => {
                    if (inviteMeta?.invite_url) {
                      console.log("[invite-open] using", {
                        invite_id: inviteMeta.invite_id,
                        created_at: inviteMeta.created_at,
                        invite_url: inviteMeta.invite_url,
                      });
                      window.location.href = inviteMeta.invite_url;
                    }
                  }}
                >
                  Abrir enlace
                </button>
              </div>
            </div>
          ) : null}

          <div>
            <label className="block text-sm font-medium text-gray-900">
              {t("inviteTracker.selectPersonLabel", {
                defaultValue: "Selecciona una persona",
              })}
            </label>

            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 bg-white text-gray-900"
              value={selectedPersonKey}
              onChange={(e) => {
                setSelectedPersonKey(e.target.value);
                setOkMsg(null);
                setErrMsg(null);
              }}
              disabled={
                loadingPeople ||
                !hasActiveAssignmentsInOrg ||
                inviteOptions.length === 0
              }
            >
              <option value="">{selectPlaceholder}</option>
              {inviteOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>

            <p className="mt-2 text-xs text-slate-600">
              {t("inviteTracker.onlyActiveAssignmentsNote", {
                defaultValue:
                  "Solo aparecen personas con asignaciones vigentes (activas y dentro del período de tiempo).",
              })}
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
              placeholder={t("inviteTracker.emailPlaceholder", {
                defaultValue: "tracker@ejemplo.com",
              })}
              autoComplete="email"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 mb-4">
            {t("inviteTracker.usage.trackers", {
              defaultValue: "Trackers usados: {{used}} / {{max}}",
              used: trackerCount,
              max: maxTrackers,
            })}
          </div>

          <button
            type="submit"
            disabled={
              busy ||
              loadingPeople ||
              loadingTrackerCount ||
              !orgId ||
              !hasActiveAssignmentsInOrg ||
              !selectedAssignment?.id ||
              inviteBlockedByPlan ||
              trackerLimitReached
            }
            className={[
              "w-full rounded-xl px-4 py-3 text-sm font-semibold",
              busy ||
              loadingPeople ||
              loadingTrackerCount ||
              !orgId ||
              !hasActiveAssignmentsInOrg ||
              !selectedAssignment?.id ||
              inviteBlockedByPlan ||
              trackerLimitReached
                ? "bg-slate-300 text-slate-600 cursor-not-allowed"
                : "bg-black text-white hover:bg-slate-900",
            ].join(" ")}
          >
            {busy
              ? t("common.sending", { defaultValue: "Enviando..." })
              : t("inviteTracker.sendInvite", {
                  defaultValue: "Enviar invitación",
                })}
          </button>
        </form>
      </div>
    </div>
  );
}