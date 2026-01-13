import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../supabaseClient";

const safeText = (v) =>
  typeof v === "string" || typeof v === "number" ? String(v) : "";

export default function AdminsPage() {
  const { user, currentOrg, currentRole, isAppRoot } = useAuth();

  const [email, setEmail] = useState("");
  const [mode, setMode] = useState("new_org_owner"); // ✅ default: nueva org
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const orgId = currentOrg?.id || null;
  const roleLower = String(currentRole || "").toLowerCase().trim();

  // ✅ Permisos:
  // - ROOT puede todo
  // - OWNER puede crear "nueva org" (viral/crecimiento)
  // - ADMIN solo puede invitar admins a su org (si habilitas ese modo)
  const canAccess = useMemo(() => {
    if (!user) return false;
    if (isAppRoot) return true;
    return roleLower === "owner" || roleLower === "admin";
  }, [user, isAppRoot, roleLower]);

  const canCreateNewOrgOwner = useMemo(() => {
    if (!user) return false;
    if (isAppRoot) return true;
    return roleLower === "owner"; // ✅ según tu nota: solo owner invita nuevos admins con org propia
  }, [user, isAppRoot, roleLower]);

  useEffect(() => {
    setMsg("");
    setErr("");
  }, []);

  if (!canAccess) {
    return (
      <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl p-4">
        <h1 className="text-xl font-semibold">Administrador</h1>
        <p className="text-slate-600 mt-2">No autorizado.</p>
      </div>
    );
  }

  async function onInvite(e) {
    e.preventDefault();
    setMsg("");
    setErr("");

    const inviteEmail = email.trim().toLowerCase();
    if (!inviteEmail) {
      setErr("Email requerido.");
      return;
    }

    // ✅ En modo "nueva org", solo root/owner
    if (mode === "new_org_owner" && !canCreateNewOrgOwner) {
      setErr("Solo el propietario (OWNER) o el ROOT puede crear administradores con organización propia.");
      return;
    }

    // ✅ En modo "admin en org actual" necesitas org activa
    if (mode === "org_admin" && !orgId) {
      setErr("No hay organización activa.");
      return;
    }

    setSending(true);
    try {
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;

      const jwt = sessionData?.session?.access_token;
      if (!jwt) throw new Error("No hay sesión activa.");

      // ✅ Payload correcto:
      // - new_org_owner => role: 'owner' + org_id: null (Edge Function crea org propia)
      // - org_admin     => role: 'admin' + org_id: currentOrg.id (admin dentro de la org actual)
      const payload =
        mode === "new_org_owner"
          ? {
              email: inviteEmail,
              role: "owner",
              org_id: null,
              org_name: inviteEmail, // nombre determinístico, como en la nota técnica
            }
          : {
              email: inviteEmail,
              role: "admin",
              org_id: orgId,
              org_name: null,
            };

      const base = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
      if (!base) throw new Error("Falta VITE_SUPABASE_FUNCTIONS_URL en env.");

      const res = await fetch(`${base}/invite_admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(safeText(json?.message) || `Error invitando (${res.status}).`);
      }

      // Mensaje claro según modo
      if (mode === "new_org_owner") {
        setMsg(`✅ Invitación enviada. El usuario nacerá con su propia organización y rol OWNER: ${inviteEmail}`);
      } else {
        setMsg(`✅ Invitación enviada. El usuario será ADMIN en tu organización: ${safeText(currentOrg?.name)}`);
      }

      setEmail("");
    } catch (e2) {
      setErr(safeText(e2?.message) || "Error.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl p-4">
      <h1 className="text-xl font-semibold">Administrador</h1>

      <p className="text-slate-600 mt-2">
        {mode === "new_org_owner"
          ? "Este flujo crea un nuevo administrador con ORGANIZACIÓN PROPIA (rol OWNER)."
          : "Este flujo invita un ADMIN dentro de tu organización actual."}
      </p>

      <form onSubmit={onInvite} className="mt-4 space-y-3">
        <div>
          <label className="block text-sm text-slate-700 mb-1">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
            placeholder="nuevo@cliente.com"
            type="email"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Tipo de invitación</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          >
            <option value="new_org_owner">Administrador con organización propia (OWNER)</option>
            <option value="org_admin">Admin dentro de mi organización actual</option>
          </select>
        </div>

        {mode === "org_admin" && (
          <div className="text-xs text-slate-500">
            Org actual: <b>{safeText(currentOrg?.name)}</b>
          </div>
        )}

        {mode === "new_org_owner" && !canCreateNewOrgOwner && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
            Nota: tu usuario actual no es OWNER/ROOT, por lo que no puede crear admins con organización propia.
          </div>
        )}

        <button
          disabled={sending || (mode === "new_org_owner" && !canCreateNewOrgOwner)}
          className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 disabled:opacity-60"
        >
          {sending ? "Enviando..." : "Invitar"}
        </button>

        {msg && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-2">
            {msg}
          </div>
        )}
        {err && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
            {err}
          </div>
        )}
      </form>
    </div>
  );
}
