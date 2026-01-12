// src/pages/InvitarAdmin.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "../supabaseClient.js";
import { useTranslation } from "react-i18next";

async function callInviteAdmin(payload) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, status: 401, data: { error: "No session token" } };
  }

  const res = await fetch(
    `${String(supabaseUrl || "").replace(/\/$/, "")}/functions/v1/invite_admin`,
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

export default function InvitarAdmin() {
  const { currentOrg } = useAuth();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("admin"); // "admin" | "owner"
  const [orgName, setOrgName] = useState("");

  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null); // { type: "success"|"error"|"warn", text: string }
  const [actionLink, setActionLink] = useState("");

  // Opcional: lista de people (igual que tracker), para elegir rápido correos existentes
  const [peopleList, setPeopleList] = useState([]);
  const [selectedOrgPeopleId, setSelectedOrgPeopleId] = useState("");

  const canInviteAdmin = useMemo(() => !!currentOrg?.id, [currentOrg?.id]);

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
    const cleanRole = String(role || "").toLowerCase() === "owner" ? "owner" : "admin";

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setMessage({
        type: "error",
        text: t?.("inviteAdmin.errors.emailInvalid") || "Email inválido",
      });
      return;
    }

    // Para invitar ADMIN, tu función requiere org_id. Usaremos currentOrg.id.
    if (cleanRole === "admin" && !currentOrg?.id) {
      setMessage({
        type: "error",
        text: t?.("inviteAdmin.errors.noOrg") || "No hay organización activa (currentOrg).",
      });
      return;
    }

    try {
      setSending(true);

      const payload =
        cleanRole === "admin"
          ? { email: cleanEmail, role: "admin", org_id: currentOrg.id }
          : {
              email: cleanEmail,
              role: "owner",
              // org_name opcional: si no envías, el backend usa email como fallback
              org_name: String(orgName || "").trim() || cleanEmail,
            };

      const resp = await callInviteAdmin(payload);

      if (!resp.ok || !resp.data) {
        setMessage({
          type: "error",
          text:
            t?.("inviteAdmin.messages.serverProblem") ||
            "Problema con el servidor. Intenta nuevamente.",
        });
        return;
      }

      if (resp.data?.ok !== true) {
        const msg = resp.data?.message || "No se pudo generar la invitación.";
        setMessage({ type: "error", text: `❌ ${msg}` });
        return;
      }

      const link = resp.data.action_link || "";
      if (!link) {
        setMessage({
          type: "error",
          text:
            t?.("inviteAdmin.messages.noLink") ||
            "Se generó respuesta pero no llegó action_link.",
        });
        return;
      }

      setActionLink(link);

      // En el estándar nuevo, siempre devolvemos action_link (no enviamos email desde Supabase).
      setMessage({
        type: "warn",
        text:
          cleanRole === "admin"
            ? `✅ Magic Link generado para ADMIN: ${cleanEmail}. Cópialo y envíalo por tu canal.`
            : `✅ Magic Link generado para OWNER: ${cleanEmail}. Cópialo y envíalo por tu canal.`,
      });

      setEmail("");
      setOrgName("");
      setSelectedOrgPeopleId("");
    } catch (err) {
      console.error("[InvitarAdmin] unexpected:", err);
      setMessage({
        type: "error",
        text:
          t?.("inviteAdmin.messages.unexpectedError") ||
          "Error inesperado. Revisa consola/logs.",
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

  const roleLabel =
    role === "owner"
      ? t?.("inviteAdmin.roles.owner") || "owner"
      : t?.("inviteAdmin.roles.admin") || "admin";

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">
          {t?.("inviteAdmin.title") || "Invitar Administrador / Owner"}
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          {t?.("inviteAdmin.subtitle") ||
            "Se genera un Magic Link (action_link). Cópialo y envíalo por tu canal (WhatsApp/Email)."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t?.("inviteAdmin.form.role") || "Rol"}
            </label>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value === "owner" ? "owner" : "admin")}
            >
              <option value="admin">admin</option>
              <option value="owner">owner</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t?.("inviteAdmin.form.selectPerson") || "Seleccionar persona (opcional)"}
            </label>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={selectedOrgPeopleId}
              onChange={handleSelectPerson}
              disabled={!currentOrg?.id}
            >
              <option value="">
                {currentOrg?.id
                  ? t?.("inviteAdmin.form.selectPlaceholder") || "— Elegir de la organización —"
                  : t?.("inviteAdmin.form.noOrg") || "— No hay org activa —"}
              </option>
              {peopleList.map((p) => (
                <option key={p.org_people_id} value={p.org_people_id}>
                  {`${p.nombre || ""} ${p.apellido || ""}`} — {p.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            {t?.("inviteAdmin.form.email") || "Email"}
          </label>
          <input
            type="email"
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="admin@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {!canInviteAdmin && role === "admin" ? (
            <div className="text-xs text-red-600 mt-2">
              {t?.("inviteAdmin.errors.noOrg") ||
                "Para invitar ADMIN debe existir currentOrg (org activa)."}
            </div>
          ) : null}
        </div>

        {role === "owner" ? (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t?.("inviteAdmin.form.orgName") || "Nombre de la nueva organización (opcional)"}
            </label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="Mi nueva organización"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
            <div className="text-[11px] text-slate-500 mt-2">
              {t?.("inviteAdmin.form.orgNameHelp") ||
                "Si lo dejas vacío, se usa el email como nombre por defecto."}
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-600 bg-slate-50 border rounded p-3">
            <span className="font-semibold">Org destino:</span>{" "}
            {currentOrg?.name || currentOrg?.org_name || currentOrg?.id || "—"}
            <span className="ml-2 opacity-70">
              ({t?.("inviteAdmin.form.orgHelp") || "admin se asigna a la org activa"})
            </span>
          </div>
        )}

        <button
          disabled={sending || (role === "admin" && !canInviteAdmin)}
          className="w-full bg-emerald-600 text-white rounded px-4 py-2 text-sm disabled:opacity-60"
        >
          {sending
            ? t?.("inviteAdmin.form.buttonSending") || "Generando link..."
            : t?.("inviteAdmin.form.buttonSend") || `Generar Magic Link (${roleLabel})`}
        </button>

        {message && <div className={`text-sm ${msgClass}`}>{message.text}</div>}

        {actionLink ? (
          <div className="text-xs break-all bg-slate-50 border rounded p-3">
            <div className="font-semibold mb-2">Magic Link ({roleLabel})</div>

            <div className="flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(actionLink)}
                className="bg-blue-600 text-white rounded px-3 py-2 text-xs"
              >
                {t?.("inviteAdmin.actions.copy") || "Copiar link"}
              </button>

              <button
                type="button"
                onClick={() => window.open(actionLink, "_blank", "noopener,noreferrer")}
                className="bg-slate-700 text-white rounded px-3 py-2 text-xs"
              >
                {t?.("inviteAdmin.actions.test") || "Probar link"}
              </button>
            </div>

            <div className="bg-white border rounded p-2 select-all">{actionLink}</div>

            <div className="text-[11px] text-slate-500 mt-2">
              {t?.("inviteAdmin.hints.bestPractice") ||
                "Recomendación: abrir en Chrome/Safari. Si falló antes, intentar en incógnito."}
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}
