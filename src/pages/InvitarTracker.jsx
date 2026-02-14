import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "../supabaseClient.js";
import { useTranslation } from "react-i18next";

async function callInviteTracker(payload) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, status: 401, data: { error: "No session token" } };
  }

  const res = await fetch(
    `${String(supabaseUrl || "").replace(/\/$/, "")}/functions/v1/invite_tracker`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data: json };
}

export default function InvitarTracker() {
  const { currentOrg } = useAuth();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const [peopleList, setPeopleList] = useState([]);
  const [selectedOrgPeopleId, setSelectedOrgPeopleId] = useState("");

  const [loadingPeople, setLoadingPeople] = useState(false);
  const [peopleError, setPeopleError] = useState("");

  const [message, setMessage] = useState(null); // { type: "success"|"error"|"warn", text: string }
  const [actionLink, setActionLink] = useState("");

  const orgId = currentOrg?.id || "";

  useEffect(() => {
    let alive = true;

    async function loadPeople() {
      setPeopleError("");
      setPeopleList([]);
      setSelectedOrgPeopleId("");

      if (!orgId) return;

      setLoadingPeople(true);
      try {
        /**
         * UNIVERSAL/PERMANENTE:
         * - Consultamos vista neutral: v_org_people_ui_all
         * - La org se filtra EXPLÍCITAMENTE por orgId (frontend)
         * - NO dependemos de get_current_org_id() dentro de la vista
         */
        const { data, error } = await supabase
          .from("v_org_people_ui_all")
          .select("org_people_id, person_id, org_id, nombre, apellido, email, label")
          .eq("org_id", orgId)
          .order("nombre", { ascending: true });

        if (!alive) return;

        if (error) {
          console.error("[InvitarTracker] loadPeople error:", error);
          setPeopleError(error.message || "Error cargando personal");
          setPeopleList([]);
          return;
        }

        setPeopleList(Array.isArray(data) ? data : []);
      } finally {
        if (alive) setLoadingPeople(false);
      }
    }

    loadPeople();

    return () => {
      alive = false;
    };
  }, [orgId]);

  const canInvite = useMemo(() => {
    const cleanEmail = String(email || "").trim().toLowerCase();
    return Boolean(orgId) && cleanEmail.includes("@") && !sending;
  }, [email, orgId, sending]);

  function handleSelectPerson(e) {
    const id = String(e.target.value || "");
    setSelectedOrgPeopleId(id);

    const p = peopleList.find((x) => String(x.org_people_id) === id);
    if (p?.email) setEmail(String(p.email).trim().toLowerCase());
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    setActionLink("");

    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setMessage({ type: "error", text: t("inviteTracker.errors.emailInvalid") });
      return;
    }

    if (!orgId) {
      setMessage({ type: "error", text: t("inviteTracker.errors.noOrg") });
      return;
    }

    try {
      setSending(true);

      const resp = await callInviteTracker({
        email: cleanEmail,
        org_id: orgId,
      });

      if (!resp.ok || !resp.data) {
        setMessage({
          type: "error",
          text: t("inviteTracker.messages.serverProblem"),
        });
        return;
      }

      const via = resp.data.invited_via; // "email" | "action_link"
      const link = resp.data.action_link || "";

      if (via === "email") {
        setMessage({
          type: "success",
          text: `✅ Invitación enviada por correo a ${cleanEmail}. Revisa spam/promociones si no aparece.`,
        });
      } else if (via === "action_link") {
        setActionLink(link);
        setMessage({
          type: "warn",
          text: `⚠️ No se pudo enviar correo automáticamente. Copia el Magic Link y envíalo al tracker: ${cleanEmail}`,
        });
      } else {
        setActionLink(link);
        setMessage({
          type: "warn",
          text: `⚠️ Invitación generada. Si no llega correo, usa el Magic Link para ${cleanEmail}.`,
        });
      }

      setEmail("");
      setSelectedOrgPeopleId("");
    } catch (err) {
      console.error("[InvitarTracker] unexpected:", err);
      setMessage({
        type: "error",
        text: t("inviteTracker.messages.unexpectedError"),
      });
    } finally {
      setSending(false);
    }
  }

  const msgClass =
    message?.type === "success"
      ? "text-emerald-700"
      : message?.type === "warn"
      ? "text-amber-700"
      : "text-red-600";

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">{t("inviteTracker.title")}</h1>

      <form
        onSubmit={handleSubmit}
        className="bg-white border rounded-2xl p-6 space-y-5 shadow-sm"
      >
        {/* PERSONA */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-slate-800">
            {t("inviteTracker.form.selectLabel") || "Escoge una persona"}
          </label>

          <select
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-base bg-white
                       focus:outline-none focus:ring-4 focus:ring-emerald-200 focus:border-emerald-400"
            value={selectedOrgPeopleId}
            onChange={handleSelectPerson}
            disabled={!orgId || loadingPeople}
          >
            <option value="">
              {loadingPeople
                ? (t("inviteTracker.form.loadingPeople") || "Cargando personas...")
                : t("inviteTracker.form.selectPlaceholder")}
            </option>

            {peopleList.map((p) => (
              <option key={p.org_people_id} value={p.org_people_id}>
                {p.label || `${p.nombre || ""} ${p.apellido || ""}`.trim()}
              </option>
            ))}
          </select>

          {!orgId ? (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
              {t("inviteTracker.errors.noOrg") || "No hay organización seleccionada."}
            </div>
          ) : null}

          {peopleError ? (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              {peopleError}
            </div>
          ) : null}

          {orgId && !loadingPeople && !peopleError && peopleList.length === 0 ? (
            <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3">
              No hay personas disponibles para esta organización.
            </div>
          ) : null}
        </div>

        {/* EMAIL */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-slate-800">
            {t("inviteTracker.form.emailLabel") || "Correo del tracker"}
          </label>

          <input
            type="email"
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-base
                       focus:outline-none focus:ring-4 focus:ring-emerald-200 focus:border-emerald-400"
            placeholder="tracker@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            inputMode="email"
            autoComplete="email"
          />

          <div className="text-xs text-slate-500">
            Tip: si escoges una persona arriba, el email se llena solo.
          </div>
        </div>

        {/* BOTÓN */}
        <button
          disabled={!canInvite}
          className={`w-full rounded-xl px-4 py-3 text-base font-semibold text-white
            ${
              canInvite
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-slate-300 cursor-not-allowed"
            }`}
        >
          {sending ? t("inviteTracker.form.buttonSending") : t("inviteTracker.form.buttonSend")}
        </button>

        {message && <div className={`text-sm ${msgClass}`}>{message.text}</div>}

        {actionLink ? (
          <div className="text-sm break-all bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <div className="font-semibold mb-3">Magic Link (tracker)</div>

            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(actionLink)}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-2 text-sm font-semibold"
              >
                Copiar link
              </button>

              <button
                type="button"
                onClick={() => window.open(actionLink, "_blank", "noopener,noreferrer")}
                className="bg-slate-800 hover:bg-slate-900 text-white rounded-xl px-4 py-2 text-sm font-semibold"
              >
                Probar link
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3 select-all">
              {actionLink}
            </div>

            <div className="text-xs text-slate-500 mt-3">
              Recomendación: el tracker debe abrirlo en Chrome/Safari (mejor incógnito si ya intentó).
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}
