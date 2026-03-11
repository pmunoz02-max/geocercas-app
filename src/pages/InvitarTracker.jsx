// src/pages/InvitarTracker.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { useAuthSafe } from "@/context/auth.js";
import useOrgEntitlements from "@/hooks/useOrgEntitlements.js";
import UpgradeToProButton from "@/components/Billing/UpgradeToProButton.jsx";

function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function isTruthy(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}

function isUuid(v) {
  const s = String(v || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
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

  const [people, setPeople] = useState([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [emailInput, setEmailInput] = useState("");

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

  const assignmentId = useMemo(() => {
    try {
      const qp = new URLSearchParams(window.location.search);
      const raw = String(qp.get("assignment_id") || "").trim();
      return isUuid(raw) ? raw : "";
    } catch {
      return "";
    }
  }, []);

  const allowedEmails = useMemo(() => {
    const set = new Set();
    for (const r of people) {
      const e = normalizeEmail(r?.email || "");
      if (e) set.add(e);
    }
    return set;
  }, [people]);

  const inviteBlockedByPlan = useMemo(() => {
    return !entitlementsLoading && isFree;
  }, [entitlementsLoading, isFree]);

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
        setLoadingPeople(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("personal")
          .select("id, org_id, nombre, apellido, email, vigente, activo, activo_bool, is_deleted")
          .eq("org_id", orgId)
          .eq("is_deleted", false)
          .limit(500);

        if (cancelled) return;
        if (error) throw error;

        const rows = Array.isArray(data) ? data : [];

        const filtered = rows.filter((r) => {
          const ab = r?.activo_bool;
          const a = r?.activo;
          const v = r?.vigente;

          if (ab !== null && ab !== undefined) return isTruthy(ab);
          if (a !== null && a !== undefined) return isTruthy(a);
          if (v !== null && v !== undefined) return isTruthy(v);
          return true;
        });

        filtered.sort((a, b) => pickPersonalLabel(a).localeCompare(pickPersonalLabel(b)));
        setPeople(filtered);
      } catch (e) {
        if (cancelled) return;
        setPeople([]);
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
    if (!selectedKey) return;
    setEmailInput(selectedKey);
  }, [selectedKey]);

  const selectedPerson = useMemo(() => {
    const key = normalizeEmail(selectedKey);
    if (!key) return null;
    return people.find((p) => normalizeEmail(p?.email) === key) || null;
  }, [people, selectedKey]);

  async function onSendInvite(e) {
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

      const res = await fetch("/api/invite-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: cleanEmail,
          org_id: orgId,
          role: "tracker",
          lang,
          name,
          caller_jwt,
          assignment_id: assignmentId || null,
        }),
      });

      const text = await res.text().catch(() => "");
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { raw: text };
      }

      if (!res.ok) {
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

      setOkMsg({ msg, actionLink, diag: body?._proxy || body?.diag || null, details });
    } catch (e2) {
      setErrMsg(String(e2?.message || e2));
    } finally {
      setBusy(false);
    }
  }

  const selectPlaceholder = loadingPeople
    ? t("common.actions.loading", { defaultValue: "Cargando…" })
    : people.length === 0
      ? t("inviteTracker.empty.noMembers", { defaultValue: "Sin personal disponible" })
      : t("common.select", { defaultValue: "— Selecciona —" });

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
            {loadingPeople ? t("common.actions.loading", { defaultValue: "Cargando…" }) : String(people.length)}
          </div>
          <div className="mt-1">
            <b>Assignment ID:</b> {assignmentId || "—"}
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
                <div className="font-semibold mb-2">Detalle enviado en el email</div>
                <div><b>Ventana asignada:</b> {okMsg.details?.timeWindow || "—"}</div>
                <div><b>Geocerca asignada:</b> {okMsg.details?.geofenceName || "—"}</div>
                <div><b>Tarea asignada:</b> {okMsg.details?.taskName || "—"}</div>
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
              value={selectedKey}
              onChange={(e) => {
                const v = normalizeEmail(e.target.value);
                setSelectedKey(v);
                setEmailInput(v);
                setOkMsg(null);
                setErrMsg(null);
              }}
              disabled={loadingPeople || people.length === 0}
            >
              <option value="">{selectPlaceholder}</option>

              {people.map((p) => {
                const email = normalizeEmail(p?.email || "");
                if (!email) return null;
                return (
                  <option key={p.id} value={email}>
                    {pickPersonalLabel(p)}
                  </option>
                );
              })}
            </select>

            <p className="mt-2 text-xs text-slate-600">
              {t("inviteTracker.onlyExistingNote", {
                defaultValue: "Solo aparecen personas existentes en",
              })}{" "}
              <b>{t("app.tabs.personal", { defaultValue: "Personal" })}</b>.
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

          <button
            type="submit"
            disabled={busy || loadingPeople || !orgId}
            className={[
              "w-full rounded-xl px-4 py-3 text-sm font-semibold",
              busy || loadingPeople || !orgId
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