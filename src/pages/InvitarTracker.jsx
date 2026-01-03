import React, { useEffect, useState } from "react";
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

  const [message, setMessage] = useState(null); // { type: "success"|"error"|"warn", text: string }
  const [actionLink, setActionLink] = useState("");

  useEffect(() => {
    async function loadPeople() {
      if (!currentOrg?.id) return;

      const { data, error } = await supabase
        .from("v_org_people_ui")
        .select("org_people_id, nombre, apellido, email, is_deleted")
        .eq("org_id", currentOrg.id)
        .eq("is_deleted", false)
        .order("nombre");

      if (!error) setPeopleList(data || []);
    }

    loadPeople();
  }, [currentOrg?.id]);

  function handleSelectPerson(e) {
    const id = e.target.value;
    setSelectedOrgPeopleId(id);

    const p = peopleList.find((x) => x.org_people_id === id);
    if (p?.email) setEmail(String(p.email).toLowerCase());
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

    if (!currentOrg?.id) {
      setMessage({ type: "error", text: t("inviteTracker.errors.noOrg") });
      return;
    }

    try {
      setSending(true);

      const resp = await callInviteTracker({
        email: cleanEmail,
        org_id: currentOrg.id,
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
        // fallback ultra seguro
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
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold mb-4">{t("inviteTracker.title")}</h1>

      <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-5 space-y-4">
        <select
          className="w-full border rounded px-3 py-2 text-sm"
          value={selectedOrgPeopleId}
          onChange={handleSelectPerson}
        >
          <option value="">{t("inviteTracker.form.selectPlaceholder")}</option>
          {peopleList.map((p) => (
            <option key={p.org_people_id} value={p.org_people_id}>
              {`${p.nombre || ""} ${p.apellido || ""}`} — {p.email}
            </option>
          ))}
        </select>

        <input
          type="email"
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="tracker@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <button
          disabled={sending}
          className="w-full bg-emerald-600 text-white rounded px-4 py-2 text-sm"
        >
          {sending ? t("inviteTracker.form.buttonSending") : t("inviteTracker.form.buttonSend")}
        </button>

        {message && <div className={`text-sm ${msgClass}`}>{message.text}</div>}

        {actionLink ? (
          <div className="text-xs break-all bg-slate-50 border rounded p-3">
            <div className="font-semibold mb-2">Magic Link (tracker)</div>

            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(actionLink)}
                className="bg-blue-600 text-white rounded px-3 py-2 text-xs"
              >
                Copiar link
              </button>

              <button
                type="button"
                onClick={() => {
                  // abre el link para prueba local
                  window.open(actionLink, "_blank", "noopener,noreferrer");
                }}
                className="bg-slate-700 text-white rounded px-3 py-2 text-xs"
              >
                Probar link
              </button>
            </div>

            <div className="bg-white border rounded p-2 select-all">{actionLink}</div>

            <div className="text-[11px] text-slate-500 mt-2">
              Recomendación: el tracker debe abrirlo en Chrome/Safari (mejor incógnito si ya intentó).
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}
