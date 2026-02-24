// src/pages/InvitarTracker.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { useAuthSafe } from "@/context/auth.js";

function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function isTruthy(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}

// âœ… Label consistente desde Personal
function pickPersonalLabel(row) {
  const nombre = String(row?.nombre || "").trim();
  const apellido = String(row?.apellido || "").trim();
  const email = String(row?.email || "").trim();

  const fullName = [nombre, apellido].filter(Boolean).join(" ").trim();

  if (fullName && email) return `${fullName} â€” ${email}`;
  return email || fullName || "(sin datos)";
}

export default function InvitarTracker() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const auth = useAuthSafe();

  const [busy, setBusy] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(true);

  // âœ… ahora son rows desde public.personal
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

  // Idioma para emails (prioridad: ?lang= -> i18n -> fallback 'es')
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

  // âœ… Mapa de emails permitidos: SOLO Personal vigente/activo
  const allowedEmails = useMemo(() => {
    const set = new Set();
    for (const r of people) {
      const e = normalizeEmail(r?.email || "");
      if (e) set.add(e);
    }
    return set;
  }, [people]);

  // âœ… Utilidad: obtiene JWT (access_token) desde el cliente
  async function getCallerJwt() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token || "";
    return String(token || "").trim();
  }

  // 1) Cargar People desde PERSONAL (no desde memberships)
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
            defaultValue: "No se pudo determinar la organizaciÃ³n activa.",
          })
        );
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

        // âœ… Filtrado â€œactivo/vigenteâ€ robusto
        const filtered = rows.filter((r) => {
          // prioridad: activo_bool -> activo -> vigente -> true
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
  }, [orgId, t]);

  // 2) Cuando seleccionan del droplist, sincroniza email
  useEffect(() => {
    if (!selectedKey) return;
    setEmailInput(selectedKey);
  }, [selectedKey]);

  // âœ… Nombre (opcional) tomado de la persona seleccionada (para email mÃ¡s bonito)
  const selectedPerson = useMemo(() => {
    const key = normalizeEmail(selectedKey);
    if (!key) return null;
    return people.find((p) => normalizeEmail(p?.email) === key) || null;
  }, [people, selectedKey]);

  async function onSendInvite(e) {
    e.preventDefault();
    setOkMsg(null);
    setErrMsg(null);

    const cleanEmail = normalizeEmail(emailInput);

    if (!orgId) {
      setErrMsg(
        t("inviteTracker.errors.noOrg", {
          defaultValue: "No se pudo determinar la organizaciÃ³n activa.",
        })
      );
      return;
    }

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setErrMsg(
        t("inviteTracker.errors.invalidEmail", {
          defaultValue: "Email invÃ¡lido.",
        })
      );
      return;
    }

    // âœ… REGLA: solo personas existentes en PERSONAL
    if (!allowedEmails.has(cleanEmail)) {
      setErrMsg(
        t("inviteTracker.errors.notInOrg", {
          defaultValue: "Ese email no existe en Personal de esta organizaciÃ³n.",
        })
      );
      return;
    }

    try {
      setBusy(true);

      // âœ… JWT desde el cliente (NO depende de /api/auth/session)
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
          caller_jwt, // âœ… clave para evitar NO_SESSION por /api/auth/session
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

      let msg = t("inviteTracker.ok.generated", {
        defaultValue: "InvitaciÃ³n generada para {{email}}.",
        email: cleanEmail,
      });

      if (emailSent === true) {
        msg += ` ${t("inviteTracker.ok.emailSent", { defaultValue: "Email enviado." })}`;
      }
      if (emailSent === false && actionLink) {
        msg += ` ${t("inviteTracker.ok.fallbackLink", { defaultValue: "Copia el enlace manualmente." })}`;
      }

      setOkMsg({ msg, actionLink, diag: body?._proxy || body?.diag || null });
    } catch (e2) {
      setErrMsg(String(e2?.message || e2));
    } finally {
      setBusy(false);
    }
  }

  const selectPlaceholder = loadingPeople
    ? t("common.loading", { defaultValue: "Cargandoâ€¦" })
    : people.length === 0
      ? t("inviteTracker.empty.noMembers", { defaultValue: "Sin personal disponible" })
      : t("common.select", { defaultValue: "â€” Selecciona â€”" });

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

        {/* DiagnÃ³stico */}
        <div className="mt-4 rounded-xl border bg-slate-50 p-3 text-xs text-slate-700">
          <div>
            <b>{t("inviteTracker.diag.orgUsed", { defaultValue: "Org usada" })}:</b>{" "}
            {who.org_id || "â€”"}
          </div>
          <div>
            <b>{t("inviteTracker.diag.user", { defaultValue: "Usuario" })}:</b>{" "}
            {who.email || "â€”"} ({who.user_id || "â€”"})
          </div>
          <div className="mt-1">
            <b>{t("inviteTracker.diag.membersLoaded", { defaultValue: "Personal cargado" })}:</b>{" "}
            {loadingPeople ? t("common.loading", { defaultValue: "Cargandoâ€¦" }) : String(people.length)}
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
              ? t("common.sending", { defaultValue: "Enviandoâ€¦" })
              : t("inviteTracker.sendInvite", { defaultValue: "Enviar invitaciÃ³n" })}
          </button>
        </form>
      </div>
    </div>
  );
}
