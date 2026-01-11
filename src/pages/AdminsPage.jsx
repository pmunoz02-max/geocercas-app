import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../supabaseClient";

const safeText = (v) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

export default function AdminsPage() {
  const { user, currentOrg, isAppRoot } = useAuth();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("admin");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const orgId = currentOrg?.id || null;

  useEffect(() => {
    setMsg("");
    setErr("");
  }, []);

  const blocked = useMemo(() => !user || !isAppRoot, [user, isAppRoot]);

  async function onInvite(e) {
    e.preventDefault();
    setMsg("");
    setErr("");

    if (blocked) {
      setErr("No autorizado.");
      return;
    }

    if (!email.trim()) {
      setErr("Email requerido.");
      return;
    }

    setSending(true);
    try {
      // Si tu flujo actual usa Edge Function invite_admin, mantenlo:
      // Llamada ejemplo (ajústala a tu endpoint real si difiere)
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData?.session?.access_token;

      const payload = {
        email: email.trim().toLowerCase(),
        role: role === "owner" ? "owner" : "admin",
        // si invitas admin, requiere org_id (tu lógica backend actual)
        org_id: role === "admin" ? orgId : null,
        org_name: email.trim().toLowerCase(),
      };

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/invite_admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(safeText(json?.message) || "Error invitando admin.");
      }

      setMsg(`Invitación enviada / link generado: ${safeText(json?.invited_email)}`);
      setEmail("");
    } catch (e2) {
      setErr(safeText(e2?.message) || "Error.");
    } finally {
      setSending(false);
    }
  }

  if (blocked) {
    return (
      <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl p-4">
        <h1 className="text-xl font-semibold">Administrador</h1>
        <p className="text-slate-600 mt-2">No autorizado.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl p-4">
      <h1 className="text-xl font-semibold">Administrador</h1>
      <p className="text-slate-600 mt-2">
        Este módulo es global (root app-level). No depende de owner/admin por organización.
      </p>

      <form onSubmit={onInvite} className="mt-4 space-y-3">
        <div>
          <label className="block text-sm text-slate-700 mb-1">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
            placeholder="admin@empresa.com"
            type="email"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Rol</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          >
            <option value="admin">admin (en org actual)</option>
            <option value="owner">owner (crea org propia)</option>
          </select>
        </div>

        {role === "admin" && (
          <div className="text-xs text-slate-500">
            Se invitará como admin en la org actual: <b>{safeText(currentOrg?.name)}</b>
          </div>
        )}

        <button
          disabled={sending}
          className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 disabled:opacity-60"
        >
          {sending ? "Enviando..." : "Invitar"}
        </button>

        {msg && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-2">{msg}</div>}
        {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{err}</div>}
      </form>
    </div>
  );
}
