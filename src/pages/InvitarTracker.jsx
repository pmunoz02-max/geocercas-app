// src/pages/InvitarTracker.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "../supabaseClient";
import { useTranslation } from "react-i18next";

/**
 * Intenta extraer detalles reales de error desde Supabase Functions:
 * - error.context.response (cuando existe)
 * - data devuelta por la Edge (si responde 200 con { ok:false })
 */
async function extractEdgeError(error) {
  if (!error) return null;

  // Caso típico: Supabase FunctionsHttpError / FunctionsFetchError
  const ctx = error?.context;
  const resp = ctx?.response;

  // Si tenemos Response, intentamos parsear JSON
  if (resp && typeof resp.json === "function") {
    try {
      const payload = await resp.json();
      return {
        message: error.message,
        stage: payload?.ctx?.stage ?? payload?.stage ?? null,
        detail: payload?.ctx?.detail ?? payload?.detail ?? payload?.error ?? null,
        hint: payload?.ctx?.hint ?? payload?.hint ?? null,
        raw: payload,
      };
    } catch (_) {
      // Si no es JSON
      try {
        const text = await resp.text();
        return { message: error.message, stage: null, detail: text, hint: null, raw: null };
      } catch (_) {
        return { message: error.message, stage: null, detail: null, hint: null, raw: null };
      }
    }
  }

  // Fallback
  return {
    message: error?.message || String(error),
    stage: null,
    detail: null,
    hint: null,
    raw: null,
  };
}

function formatEdgeErrorForUI(t, info) {
  if (!info) {
    return t(
      "inviteTracker.messages.serverProblem",
      "There was a problem contacting the invitation server."
    );
  }

  // Construimos un mensaje compacto pero útil para diagnóstico
  const parts = [];
  if (info.stage) parts.push(`stage: ${info.stage}`);
  if (info.detail) parts.push(`detail: ${info.detail}`);
  if (info.hint) parts.push(`hint: ${info.hint}`);

  // Si no hay nada “estructurado”, al menos damos el message
  if (parts.length === 0) return info.message || "Unknown error";

  return `${t(
    "inviteTracker.messages.serverProblem",
    "There was a problem contacting the invitation server."
  )} (${parts.join(" · ")})`;
}

export default function InvitarTracker() {
  const { currentOrg } = useAuth();
  const { t } = useTranslation();

  const orgName = currentOrg?.name || t("inviteTracker.orgFallback", "your organization");

  // Estados
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);

  // Personal vigente
  const [personalList, setPersonalList] = useState([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");

  // ============================================================
  // Cargar PERSONAL vigente
  // ============================================================
  useEffect(() => {
    async function loadPersonal() {
      if (!currentOrg?.id) return;

      const { data, error } = await supabase
        .from("personal")
        .select("id, nombre, email")
        .eq("org_id", currentOrg.id)
        .eq("vigente", true)
        .eq("is_deleted", false)
        .order("nombre", { ascending: true });

      if (error) {
        console.error("[InvitarTracker] Error cargando personal:", error);
        return;
      }

      setPersonalList(data || []);
    }

    loadPersonal();
  }, [currentOrg?.id]);

  // Cuando el usuario selecciona un personal
  function handleSelectPerson(e) {
    const id = e.target.value;
    setSelectedPersonId(id);

    if (!id) return;

    const p = personalList.find((x) => x.id === id);
    if (p?.email) {
      setEmail(p.email.toLowerCase());
    }
  }

  // Si el usuario escribe manualmente un email, anulamos la selección del dropdown
  function handleEmailChange(e) {
    setEmail(e.target.value);
    setSelectedPersonId("");
  }

  // ============================================================
  // Enviar invitación
  // ============================================================
  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);

    const trimmedEmail = (email || "").trim().toLowerCase();

    if (!trimmedEmail) {
      setMessage({ type: "error", text: t("inviteTracker.errors.emailRequired") });
      return;
    }

    // Validación simple de formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setMessage({ type: "error", text: t("inviteTracker.errors.emailInvalid") });
      return;
    }

    if (!currentOrg?.id) {
      setMessage({
        type: "error",
        text: t(
          "inviteTracker.errors.noOrg",
          "No active organization found. Please select an organization and try again."
        ),
      });
      return;
    }

    try {
      setSending(true);

      // ✅ Unificamos la llamada en un solo punto, pero con diagnóstico real.
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: trimmedEmail,
          role_name: "tracker",
          full_name: null,
          org_id: currentOrg.id,
        },
      });

      if (error) {
        const info = await extractEdgeError(error);
        console.error("[InvitarTracker] invite-user ERROR:", { error, info });

        setMessage({
          type: "error",
          text: formatEdgeErrorForUI(t, info),
        });
        return;
      }

      if (!data?.ok) {
        // Edge devolvió 200 pero ok:false
        console.warn("[InvitarTracker] respuesta no-ok:", data);

        const stage = data?.ctx?.stage || data?.stage || null;
        const detail = data?.ctx?.detail || data?.detail || data?.error || null;
        const hint = data?.ctx?.hint || data?.hint || null;

        const parts = [];
        if (stage) parts.push(`stage: ${stage}`);
        if (detail) parts.push(`detail: ${detail}`);
        if (hint) parts.push(`hint: ${hint}`);

        const fallback = t(
          "inviteTracker.messages.notOk",
          "The invitation could not be completed. Check the email and try again."
        );

        setMessage({
          type: "error",
          text: parts.length ? `${fallback} (${parts.join(" · ")})` : (data?.error || fallback),
        });
        return;
      }

      // Mensajería por modo
      const mode = data.mode;

      if (mode === "invited") {
        setMessage({
          type: "success",
          text: t("inviteTracker.messages.invited", {
            email: data.email || trimmedEmail,
            orgName,
          }),
        });
      } else if (mode === "magiclink_sent") {
        setMessage({
          type: "success",
          text: t("inviteTracker.messages.magiclinkSent", {
            email: data.email || trimmedEmail,
          }),
        });
      } else if (mode === "link_only") {
        const link = data.invite_link;
        setMessage({
          type: "success",
          text: link
            ? t("inviteTracker.messages.linkOnlyWithLink", { link })
            : t("inviteTracker.messages.linkOnlyNoLink"),
        });
      } else if (mode === "created_without_email") {
        setMessage({
          type: "success",
          text: t("inviteTracker.messages.createdWithoutEmail"),
        });
      } else {
        setMessage({
          type: "success",
          text: t("inviteTracker.messages.genericProcessed", {
            email: data.email || trimmedEmail,
          }),
        });
      }

      setEmail("");
      setSelectedPersonId("");
    } catch (err) {
      console.error("[InvitarTracker] Error inesperado:", err);
      setMessage({
        type: "error",
        text:
          err?.message ||
          t(
            "inviteTracker.messages.unexpectedError",
            "Unexpected error while processing the invitation."
          ),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mb-3">
        {t("inviteTracker.title")}
      </h1>

      <p className="text-sm md:text-base text-slate-600 mb-6">
        {t("inviteTracker.subtitle", { orgName })}
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4"
      >
        {/* SELECT DE PERSONAL */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {t("inviteTracker.form.selectLabel")}
          </label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={selectedPersonId}
            onChange={handleSelectPerson}
          >
            <option value="">{t("inviteTracker.form.selectPlaceholder")}</option>
            {personalList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — {p.email}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-500">
            {t("inviteTracker.form.selectHelp")}
          </p>
        </div>

        {/* CAMPO EMAIL */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {t("inviteTracker.form.emailLabel")}
          </label>
          <input
            type="email"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder={t("inviteTracker.form.emailPlaceholder", "tracker@example.com")}
            value={email}
            onChange={handleEmailChange}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            {t("inviteTracker.form.emailHelp")}
          </p>
        </div>

        {/* BOTÓN */}
        <button
          type="submit"
          disabled={sending}
          className="w-full inline-flex justify-center items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {sending ? t("inviteTracker.form.buttonSending") : t("inviteTracker.form.buttonSend")}
        </button>

        {message && (
          <div
            className={`mt-2 text-sm ${
              message.type === "success" ? "text-emerald-700" : "text-red-600"
            }`}
          >
            {message.text}
          </div>
        )}
      </form>
    </div>
  );
}
