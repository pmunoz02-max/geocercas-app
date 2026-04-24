import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { useAuthSafe } from "@/context/auth.js";
import useOrgEntitlements from "@/hooks/useOrgEntitlements.js";
import UpgradeToProButton from "@/components/Billing/UpgradeToProButton";

const INVITE_API_URL = "/api/invite-tracker";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
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
  const value = String(planCode || "").trim().toLowerCase();
  if (value === "pro") return "PRO";
  if (value === "enterprise") return "ENTERPRISE";
  if (value === "elite_plus") return "ELITE PLUS";
  if (value === "elite") return "ELITE";
  if (value === "starter") return "STARTER";
  if (value === "free") return "FREE";
  return value ? value.toUpperCase() : "-";
}

export default function InvitarTracker() {
  // =========================
  // HOOKS BASE
  // =========================
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const auth = useAuthSafe();
  const { entitlements, loading: entitlementsLoading } = useOrgEntitlements();

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

  // =========================
  // DERIVADOS BASE
  // =========================
  const safeMaxTrackers = Number(entitlements?.max_trackers ?? 0);

  const planCode = String(
    entitlements?.plan_code ||
      entitlements?.plan ||
      entitlements?.subscription_plan ||
      "free"
  )
    .trim()
    .toLowerCase();

  const normalizedPlanStatus = String(entitlements?.plan_status || "free")
    .trim()
    .toLowerCase();

  const isCancellationScheduled = Boolean(entitlements?.cancel_at_period_end);
  const isActive = normalizedPlanStatus === "active";

  // =========================
  // MEMOS
  // =========================
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

  const lang = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryLang = String(params.get("lang") || "").trim().toLowerCase();
      if (["es", "en", "fr"].includes(queryLang)) return queryLang;
    } catch {
      // no-op
    }

    const currentLang = String(i18n?.resolvedLanguage || i18n?.language || "es")
      .trim()
      .toLowerCase();

    if (currentLang.startsWith("en")) return "en";
    if (currentLang.startsWith("fr")) return "fr";
    return "es";
  }, [i18n]);

  const hasActiveAssignmentsInOrg = useMemo(() => {
    return activeAssignaciones.length > 0;
  }, [activeAssignaciones]);

  const inviteBlockedByPlan = useMemo(() => {
    return !entitlementsLoading && !isActive;
  }, [entitlementsLoading, isActive]);

  const trackerLimitReached = useMemo(() => {
    if (loadingTrackerCount) return false;
    if (safeMaxTrackers <= 0) return true;
    return trackerCount >= safeMaxTrackers;
  }, [loadingTrackerCount, trackerCount, safeMaxTrackers]);

  const trackersUsageLabel = useMemo(() => {
    if (loadingTrackerCount) return "…";
    return `${trackerCount} / ${safeMaxTrackers}`;
  }, [loadingTrackerCount, trackerCount, safeMaxTrackers]);

  const activeAssignmentByPersonId = useMemo(() => {
    const map = new Map();

    for (const assignment of activeAssignaciones) {
      const personId = String(assignment?.personal_id || "").trim();
      if (personId && !map.has(personId)) {
        map.set(personId, assignment);
      }
    }

    return map;
  }, [activeAssignaciones]);

  const peopleWithActiveAssignments = useMemo(() => {
    const filtered = people.filter((person) => {
      const personId = String(person?.id || "").trim();
      return personId && activeAssignmentByPersonId.has(personId);
    });

    filtered.sort((a, b) => pickPersonalLabel(a).localeCompare(pickPersonalLabel(b)));
    return filtered;
  }, [people, activeAssignmentByPersonId]);

  const inviteOptions = useMemo(() => {
    return peopleWithActiveAssignments.map((person) => {
      const key = String(person?.id || "").trim();
      return {
        key,
        person,
        label: pickPersonalLabel(person),
      };
    });
  }, [peopleWithActiveAssignments]);

  const selectedOption = useMemo(() => {
    return inviteOptions.find((option) => option.key === selectedPersonKey) || null;
  }, [inviteOptions, selectedPersonKey]);

  const selectedPerson = useMemo(() => {
    if (!selectedPersonKey) return null;
    return people.find((person) => String(person?.id || "").trim() === selectedPersonKey) || null;
  }, [people, selectedPersonKey]);

  const selectedAssignment = useMemo(() => {
    if (!selectedPerson) return null;
    const personId = String(selectedPerson?.id || "").trim();
    return personId ? activeAssignmentByPersonId.get(personId) || null : null;
  }, [activeAssignmentByPersonId, selectedPerson]);

  const allowedEmails = useMemo(() => {
    const emails = new Set();

    for (const person of peopleWithActiveAssignments) {
      const email = normalizeEmail(person?.email);
      if (email) emails.add(email);
    }

    return emails;
  }, [peopleWithActiveAssignments]);

  const selectPlaceholder = useMemo(() => {
    if (loadingPeople) {
      return t("common.actions.loading", { defaultValue: "Cargando..." });
    }

    if (inviteOptions.length === 0) {
      return t("inviteTracker.empty.noActiveAssignments", {
        defaultValue: "Sin personal con asignación activa",
      });
    }

    return t("common.select", { defaultValue: "- Selecciona -" });
  }, [loadingPeople, inviteOptions.length, t]);

  // =========================
  // EFFECTS
  // =========================
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

        if (error) throw error;

        if (!cancelled) {
          setTrackerCount(count || 0);
        }
      } catch (error) {
        console.error("[invite-tracker] tracker count error", error);
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
        if (!cancelled) {
          setPeople([]);
          setActiveAssignaciones([]);
          setLoadingPeople(false);
          setErrMsg(
            t("inviteTracker.errors.noOrg", {
              defaultValue: "No se pudo determinar la organización activa.",
            })
          );
        }
        return;
      }

      if (entitlementsLoading || !isActive) {
        if (!cancelled) {
          setPeople([]);
          setActiveAssignaciones([]);
          setLoadingPeople(false);
        }
        return;
      }

      try {
        const now = new Date().toISOString();

        const { data: assignacionesRows, error: assignacionesError } = await supabase
          .from("asignaciones")
          .select("id, org_id, personal_id, user_id, estado, status, start_time, end_time, is_deleted")
          .eq("org_id", orgId)
          .or("is_deleted.is.false,is_deleted.is.null")
          .or(`estado.eq.activa,status.eq.active,end_time.is.null,end_time.gte.${now}`)
          .limit(1000);

        if (assignacionesError) throw assignacionesError;
        if (cancelled) return;

        const activePersonIds = Array.from(
          new Set(
            (assignacionesRows || [])
              .map((assignment) => String(assignment?.personal_id || "").trim())
              .filter(Boolean)
          )
        );

        let peopleRows = [];

        if (activePersonIds.length > 0) {
          const { data, error } = await supabase
            .from("personal")
            .select("id, org_id, nombre, apellido, email, user_id, is_deleted")
            .eq("org_id", orgId)
            .or("is_deleted.is.false,is_deleted.is.null")
            .in("id", activePersonIds)
            .limit(500);

          if (error) throw error;
          peopleRows = data || [];
        }

        if (cancelled) return;

        setPeople(Array.isArray(peopleRows) ? peopleRows : []);
        setActiveAssignaciones(Array.isArray(assignacionesRows) ? assignacionesRows : []);
      } catch (error) {
        console.error("[invite-tracker] loadInviteSources error", error);
        if (cancelled) return;
        setPeople([]);
        setActiveAssignaciones([]);
        setErrMsg(String(error?.message || error));
      } finally {
        if (!cancelled) {
          setLoadingPeople(false);
        }
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

  // =========================
  // HELPERS / HANDLERS
  // =========================
  async function getAccessToken() {
    const directToken = auth?.session?.access_token || auth?.access_token || auth?.token || null;
    if (directToken) return directToken;

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    return data?.session?.access_token || null;
  }

  async function onSendInvite(event) {
    event.preventDefault();

    setBusy(true);
    setOkMsg(null);
    setErrMsg(null);
    setInviteLink("");
    setInviteMeta(null);

    try {
      if (!orgId) {
        throw new Error(
          t("inviteTracker.errors.noOrg", {
            defaultValue: "No se pudo determinar la organización activa.",
          })
        );
      }

      if (inviteBlockedByPlan) {
        throw new Error(
          t("inviteTracker.plan.genericBlockedBody", {
            defaultValue: "Las invitaciones de tracker requieren una suscripción activa compatible.",
          })
        );
      }

      if (trackerLimitReached) {
        throw new Error(
          t("inviteTracker.usage.limitReached", {
            defaultValue: "Límite alcanzado",
          })
        );
      }

      if (!selectedPerson || !selectedAssignment?.id) {
        throw new Error(
          t("inviteTracker.errors.selectPerson", {
            defaultValue: "Selecciona una persona con asignación activa.",
          })
        );
      }

      const email = normalizeEmail(emailInput);

      if (!email || !isValidEmail(email)) {
        throw new Error(
          t("inviteTracker.errors.invalidEmail", {
            defaultValue: "Ingresa un email válido.",
          })
        );
      }

      if (!allowedEmails.has(email)) {
        throw new Error(
          t("inviteTracker.errors.emailMustMatchAssignedPerson", {
            defaultValue: "El email debe coincidir con el personal seleccionado con asignación activa.",
          })
        );
      }

      const accessToken = await getAccessToken();

      if (!accessToken) {
        throw new Error(
          t("inviteTracker.errors.noSession", {
            defaultValue: "No se encontró una sesión válida.",
          })
        );
      }

      const payload = {
        org_id: orgId,
        email,
        lang,
        personal_id: selectedPerson.id,
        assignment_id: selectedAssignment.id,
      };

      const response = await fetch(INVITE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "x-user-jwt": accessToken,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.message ||
            result?.error ||
            t("inviteTracker.errors.sendFailed", {
              defaultValue: "No se pudo enviar la invitación.",
            })
        );
      }

      const inviteUrl = String(result?.invite_url || result?.inviteUrl || result?.url || "");

      setInviteLink(inviteUrl);
      setInviteMeta({
        invite_id: result?.invite_id || result?.inviteId || "",
        created_at: result?.created_at || result?.createdAt || "",
        invite_url: inviteUrl,
      });

      setOkMsg(
        t("inviteTracker.success.inviteCreated", {
          defaultValue: "Invitación creada correctamente.",
        })
      );
    } catch (error) {
      console.error("[invite-tracker] send invite error", error);
      setErrMsg(String(error?.message || error));
    } finally {
      setBusy(false);
    }
  }

  // =========================
  // GUARDS
  // =========================
  if (auth?.loading || entitlementsLoading || !entitlements) {
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

  if (inviteBlockedByPlan) {
    let blockMsg = null;

    if (planCode === "pro" && !isActive) {
      blockMsg = (
        <>
          <div className="mt-2 text-sm">
            {t("inviteTracker.plan.detectedPlan", { defaultValue: "Plan detectado" })}: <span className="font-semibold">PRO</span>
          </div>
          <div className="mt-2 text-sm">
            {t("inviteTracker.plan.statusLabel", { defaultValue: "Estado del plan" })}: {" "}
            <span className="font-semibold">
              {t(`status.${normalizedPlanStatus}`, { defaultValue: normalizedPlanStatus })}
            </span>
          </div>
          <div className="mt-3 text-sm">
            {t("inviteTracker.plan.proInactiveBlockedBody", {
              defaultValue: "Las invitaciones de tracker requieren una suscripción PRO activa.",
            })}
          </div>
          {isCancellationScheduled ? (
            <div className="mt-2 text-xs text-amber-800">
              {t("inviteTracker.plan.cancellationScheduled", {
                defaultValue: "Tu suscripción tiene una cancelación programada al final del período.",
              })}
            </div>
          ) : null}
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
            {t("inviteTracker.plan.detectedPlan", { defaultValue: "Plan detectado" })}: {" "}
            <span className="font-semibold">{normalizePlanLabel(planCode)}</span>
          </div>
          <div className="mt-2 text-sm">
            {t("inviteTracker.plan.statusLabel", { defaultValue: "Estado del plan" })}: {" "}
            <span className="font-semibold">
              {t(`status.${normalizedPlanStatus}`, { defaultValue: normalizedPlanStatus })}
            </span>
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
                {t("inviteTracker.plan.upgradePrompt", {
                  defaultValue: "Actualiza esta organización para habilitar invitaciones de trackers.",
                })}
              </div>
              <UpgradeToProButton orgId={orgId} getAccessToken={getAccessToken} />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // =========================
  // JSX
  // =========================
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
                {t("inviteTracker.usage.title", { defaultValue: "Uso de trackers" })}
              </div>
              <div className="mt-1 text-sm text-slate-700">
                {t("inviteTracker.usage.current", {
                  defaultValue: "Usados: {{used}} / {{max}}",
                  used: trackerCount,
                  max: safeMaxTrackers,
                })}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {t("inviteTracker.usage.plan", {
                  defaultValue: "Plan: {{plan}} · Estado: {{status}}",
                  plan: normalizePlanLabel(planCode),
                  status: String(normalizedPlanStatus || "-").toUpperCase(),
                })}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {t("inviteTracker.usage.label", {
                  defaultValue: "Uso calculado: {{value}}",
                  value: trackersUsageLabel,
                })}
              </div>
            </div>

            <div className="text-sm">
              {loadingTrackerCount ? (
                <span className="text-slate-500">
                  {t("inviteTracker.usage.loading", { defaultValue: "Calculando uso…" })}
                </span>
              ) : trackerLimitReached ? (
                <span className="font-medium text-amber-700">
                  {t("inviteTracker.usage.limitReached", { defaultValue: "Límite alcanzado" })}
                </span>
              ) : (
                <span className="font-medium text-emerald-700">
                  {t("inviteTracker.usage.available", { defaultValue: "Cupo disponible" })}
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-900 transition-all"
              style={{
                width:
                  safeMaxTrackers > 0
                    ? `${Math.min(100, Math.round((trackerCount / safeMaxTrackers) * 100))}%`
                    : "0%",
              }}
            />
          </div>

          {trackerLimitReached ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm text-slate-700 mb-3">
                {t("inviteTracker.usage.upgradeLimit", {
                  defaultValue: "Tu plan actual llegó al límite. Actualiza para agregar más trackers.",
                })}
              </div>
              {orgId ? <UpgradeToProButton orgId={orgId} getAccessToken={getAccessToken} /> : null}
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
              {t("inviteTracker.selectPersonLabel", { defaultValue: "Selecciona una persona" })}
            </label>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 bg-white text-gray-900"
              value={selectedPersonKey}
              onChange={(event) => {
                setSelectedPersonKey(event.target.value);
                setOkMsg(null);
                setErrMsg(null);
              }}
              disabled={loadingPeople || !hasActiveAssignmentsInOrg || inviteOptions.length === 0}
            >
              <option value="">{selectPlaceholder}</option>
              {inviteOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-600">
              {t("inviteTracker.onlyActiveAssignmentsNote", {
                defaultValue: "Solo aparecen personas con asignaciones vigentes (activas y dentro del período de tiempo).",
              })}
            </p>
            {selectedOption ? (
              <p className="mt-2 text-xs text-slate-500">
                {t("inviteTracker.selectedPerson", {
                  defaultValue: "Seleccionado: {{label}}",
                  label: selectedOption.label,
                })}
              </p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900">
              {t("inviteTracker.emailLabel", { defaultValue: "Correo electrónico del tracker" })}
            </label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring bg-white text-gray-900"
              type="email"
              value={emailInput}
              onChange={(event) => {
                setEmailInput(event.target.value);
                setOkMsg(null);
                setErrMsg(null);
              }}
              placeholder={t("inviteTracker.emailPlaceholder", { defaultValue: "tracker@ejemplo.com" })}
              autoComplete="email"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 mb-4">
            {t("inviteTracker.usage.trackers", {
              defaultValue: "Trackers usados: {{used}} / {{max}}",
              used: trackerCount,
              max: safeMaxTrackers,
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
              : t("inviteTracker.sendInvite", { defaultValue: "Enviar invitación" })}
          </button>
        </form>
      </div>
    </div>
  );
}
