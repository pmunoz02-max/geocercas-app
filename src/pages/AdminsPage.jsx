import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../supabaseClient";

const safeText = (v) =>
  typeof v === "string" || typeof v === "number" ? String(v) : "";

export default function AdminsPage() {
  const { user, currentOrg, currentRole, isAppRoot } = useAuth();

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

  const roleLower = String(currentRole || "").toLowerCase().trim();

  /**
   * ✅ Reglas de acceso CORRECTAS
   * - ROOT → acceso total
   * - OWNER / ADMIN → acceso limitado a su org
   */
  const canAccess = useMemo(() => {
    if (!user) return false;
    if (isAppRoot) return true;
    return roleLower === "owner" || roleLower === "admin";
  }, [user, isAppRoot, roleLower]);

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

    if (!email.trim()) {
      setErr("Email requerido.");
      return;
    }

    // OWNER / ADMIN NO pueden invitar owners
    if (!isAppRoot && role === "owner") {
      setErr("Solo el ROOT puede invitar owners.");
      return;
    }

    if (role === "admin" && !orgId) {
      setErr("No hay organización activa.");
      return;
    }

    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData?.session?.access_token;

      const payload = {
        email: email.trim().toLowerCase(),
        role: role === "owner" ? "owner" : "admin",
        org_id: role === "admin" ? orgId : null,
        org_name: role === "owner" ? email.trim().toLowerCase() : null,
      };

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/invite_admin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(safeText(json?.message) || "Error invitando admin.");
      }

      setMsg(
        `Invitación enviada correctamente: ${safeText(json?.invited_email)}`
      );
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
        {isAppRoot
          ? "Modo ROOT: puedes crear owners (nuevas organizaciones) o admins."
          : "Modo organización: puedes invitar admins a tu organización."}
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
            {isAppRoot && <option value="owner">owner (crea org propia)</option>}
          </select>
        </div>

        {role === "admin" && (
          <div className="text-xs text-slate-500">
            Se invitará como admin en la org actual:{" "}
            <b>{safeText(currentOrg?.name)}</b>
          </div>
        )}

        <button
          disabled={sending}
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
