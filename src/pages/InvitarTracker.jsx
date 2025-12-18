// src/pages/InvitarTracker.jsx
import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/supabaseClient";
import { useTranslation } from "react-i18next";

/**
 * Llamada DEBUG/PRODUCCIÓN sin supabase.functions.invoke, para poder leer
 * el body real incluso cuando el servidor responde 500.
 *
 * Requisitos (Vite):
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_ANON_KEY
 */
async function inviteUserViaFetch(payload) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return {
      ok: false,
      status: 0,
      parsed: null,
      text: null,
      error: "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY",
    };
  }

  const {
    data: { session },
    error: sessionErr,
  } = await supabase.auth.getSession();

  if (sessionErr) {
    return {
      ok: false,
      status: 0,
      parsed: null,
      text: null,
      error: `auth.getSession error: ${sessionErr.message}`,
    };
  }

  const accessToken = session?.access_token;
  if (!accessToken) {
    return {
      ok: false,
      status: 0,
      parsed: null,
      text: null,
      error: "No access token in session",
    };
  }

  const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/invite-user`;

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    return {
      ok: false,
      status: 0,
      parsed: null,
      text: null,
      error: `Network error: ${networkErr?.message || String(networkErr)}`,
    };
  }

  const contentType = res.headers.get("content-type") || "";
  let parsed = null;
  let text = null;

  try {
    if (contentType.includes("application/json")) {
      parsed = await res.json();
    } else {
      text = await res.text();
    }
  } catch (parseErr) {
    // Si falla parse, intentamos leer como texto
    try {
      text = await res.text();
    } catch (_) {
      text = `Response parse error: ${parseErr?.message || String(parseErr)}`;
    }
  }

  return {
    ok: res.ok,
    status: res.status,
    parsed,
    text,
    error: null,
  };
}

function compactErrorMessage(t, resp) {
  // Resp puede traer parsed con { ctx: { stage, detail, hint }, ... }
  const p = resp?.parsed;
  const ctx = p?.ctx || p;

  const stage = ctx?.stage ?? null;
  const detail = ctx?.detail ?? ctx?.error ?? null;
  const hint = ctx?.hint ?? null;

  const parts = [];
  if (resp?.status) parts.push(`http: ${resp.status}`);
  if (stage) parts.push(`stage: ${stage}`);
  if (detail) parts.push(`detail: ${detail}`);
  if (hint) parts.push(`hint: ${hint}`);

  if (parts.length) {
    return `${t(
      "inviteTracker.messages.serverProblem",
      "There was a problem contacting the invitation server."
    )} (${parts.join(" · ")})`;
  }

  if (resp?.error) return resp.error;
  if (resp?.text) return resp.text;

  return t(
    "inviteTracker.messages.serverProblem",
    "There was a problem contacting the invitation server."
  );
}

export default function InvitarTracker() {
  const { currentOrg } = useAuth();
  const { t } = useTranslation();

  const orgName = currentOrg?.name || t("inviteTracker.orgFallback", "your organization");

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);

  // Personal vigente
  const [personalList, setPersonalList] = useState([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");

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

  function handleSelectPerson(e) {
    const id = e.target.value;
    setSelectedPersonId(id);

    if (!id) return;

    const p = personalList.find((x) => x.id === id);
    if (p?.email) setEmail(p.email.toLowerCase());
  }

  function handleEmailChange(e) {
    setEmail(e.target.value);
    setSelectedPersonId("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);

    const trimmedEmail = (email || "").trim().toLowerCase();

    if (!trimmedEmail) {
      setMessage({ type: "error", text: t("inviteTracker.errors.emailRequired") });
      return;
    }

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

      const payload = {
        email: trimmedEmail,
        role_name: "tracker",
        full_name: null,
        org_id: currentOrg.id,
      };

      const resp = await inviteUserViaFetch(payload);

      // Log ultra explícito para que no se “oculte” en consola
      console.error("[InvitarTracker] invite-user RAW RESPONSE:", {
        ok: resp.ok,
        status: resp.status,
        parsed: resp.parsed,
        text: resp.text,
        error: resp.error,
      });

      if (!resp.ok) {
        setMessage({ type: "error", text: compactErrorMessage(t, resp) });
        return;
      }

      const data = resp.parsed;

      if (!data?.ok) {
        setMessage({
          type: "error",
          text: compactErrorMessage(t, { ...resp, parsed: data }),
        });
        return;
      }

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
          <p className="mt-1 text-[11px] text-slate-500">{t("inviteTracker.form.selectHelp")}</p>
        </div>

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
          <p className="mt-1 text-[11px] text-slate-500">{t("inviteTracker.form.emailHelp")}</p>
        </div>

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