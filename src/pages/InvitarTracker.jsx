import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/supabaseClient";
import { useTranslation } from "react-i18next";

/**
 * Llamada directa a Edge Function invite_tracker
 */
async function inviteTracker(payload) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, error: "No session token" };
  }

  const res = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1/invite_tracker`,
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

  return {
    ok: res.ok,
    status: res.status,
    data: json,
  };
}

export default function InvitarTracker() {
  const { currentOrg } = useAuth();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);
  const [magicLink, setMagicLink] = useState(null);

  const [peopleList, setPeopleList] = useState([]);
  const [selectedOrgPeopleId, setSelectedOrgPeopleId] = useState("");

  useEffect(() => {
    async function loadPeople() {
      if (!currentOrg?.id) return;

      const { data, error } = await supabase
        .from("v_org_people_ui")
        .select("org_people_id, nombre, apellido, email")
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
    if (p?.email) setEmail(p.email.toLowerCase());
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    setMagicLink(null);

    if (!email || !email.includes("@")) {
      setMessage({ type: "error", text: t("inviteTracker.errors.emailInvalid") });
      return;
    }

    if (!currentOrg?.id) {
      setMessage({ type: "error", text: t("inviteTracker.errors.noOrg") });
      return;
    }

    try {
      setSending(true);

      const resp = await inviteTracker({
        email: email.trim().toLowerCase(),
        org_id: currentOrg.id,
      });

      if (!resp.ok || !resp.data) {
        setMessage({
          type: "error",
          text: t("inviteTracker.messages.serverProblem"),
        });
        return;
      }

      if (resp.data.invited_via === "email") {
        setMessage({
          type: "success",
          text: t("inviteTracker.messages.invited", { email }),
        });
      }

      if (resp.data.invited_via === "action_link") {
        setMagicLink(resp.data.action_link);
        setMessage({
          type: "success",
          text: t("inviteTracker.messages.magiclinkSent"),
        });
      }

      setEmail("");
      setSelectedOrgPeopleId("");
    } catch (err) {
      setMessage({
        type: "error",
        text: t("inviteTracker.messages.unexpectedError"),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold mb-4">
        {t("inviteTracker.title")}
      </h1>

      <form
        onSubmit={handleSubmit}
        className="bg-white border rounded-xl p-5 space-y-4"
      >
        <select
          className="w-full border rounded px-3 py-2 text-sm"
          value={selectedOrgPeopleId}
          onChange={handleSelectPerson}
        >
          <option value="">
            {t("inviteTracker.form.selectPlaceholder")}
          </option>
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
          {sending
            ? t("inviteTracker.form.buttonSending")
            : t("inviteTracker.form.buttonSend")}
        </button>

        {message && (
          <div
            className={`text-sm ${
              message.type === "success"
                ? "text-emerald-700"
                : "text-red-600"
            }`}
          >
            {message.text}
          </div>
        )}

        {magicLink && (
          <div className="text-xs break-all bg-slate-50 border rounded p-2">
            <p className="mb-1 font-semibold">Magic Link (tracker):</p>
            <button
              onClick={() => navigator.clipboard.writeText(magicLink)}
              className="text-blue-600 underline"
            >
              Copiar link
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
