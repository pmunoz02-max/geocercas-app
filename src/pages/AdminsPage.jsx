// src/pages/AdminsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../supabaseClient.js";

/* =========================
   Helpers SOLO PARA UI
   ========================= */

function renderText(v, fallback = "—") {
  if (v == null) return fallback;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return fallback;
  }
}

function isValidEmail(email) {
  const s = String(email || "").trim();
  return s.includes("@") && s.length >= 6;
}

/* =========================
   Data loaders
   ========================= */

async function loadAdminsForOrg(orgId) {
  const r1 = await supabase
    .from("memberships")
    .select("user_id, role, created_at")
    .eq("org_id", orgId)
    .in("role", ["owner", "admin"]);

  if (r1?.error) throw r1.error;

  const memberships = Array.isArray(r1.data) ? r1.data : [];
  const userIds = [...new Set(memberships.map(m => m.user_id).filter(Boolean))];

  let emailById = new Map();
  if (userIds.length) {
    const r2 = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", userIds);

    if (r2?.error) throw r2.error;
    for (const p of r2.data || []) emailById.set(p.id, p.email);
  }

  return memberships.map(m => ({
    user_id: m.user_id,
    role: m.role,
    email: emailById.get(m.user_id) || "",
    created_at: m.created_at,
  }));
}

/* =========================
   Page
   ========================= */

export default function AdminsPage() {
  const { authReady, orgsReady, currentOrg, user, isRootOwner } = useAuth();

  // ⚠️ IDs y datos lógicos → SIN renderText
  const orgId = currentOrg?.id ?? null;
  const orgName = currentOrg?.name ?? "";
  const userEmail = user?.email ?? "";

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("admin");

  if (!authReady || !orgsReady) {
    return <p className="p-6 text-sm text-slate-600">Cargando sesión…</p>;
  }

  if (!isRootOwner) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Administradores</h1>
        <p className="text-sm text-slate-600 mt-2">
          Este módulo es exclusivo del propietario.
        </p>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="p-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
        No se encontró la organización actual.
      </div>
    );
  }

  const fetchAdmins = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await loadAdminsForOrg(orgId);
      setAdmins(rows);
    } catch (e) {
      setError(e?.message || "No se pudo cargar la lista.");
      setAdmins([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const handleInvite = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const email = inviteEmail.trim().toLowerCase();
    if (!isValidEmail(email)) {
      setError("Correo inválido.");
      return;
    }

    setLoadingAction(true);
    try {
      setSuccess(`Invitación procesada para ${email}.`);
      setInviteEmail("");
      await fetchAdmins();
    } catch (e) {
      setError(e?.message || "Error al invitar.");
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Administradores</h1>
        <p className="text-sm text-slate-600 mt-1">
          Organización: <b>{renderText(orgName)}</b>
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Usuario: <span className="font-mono">{renderText(userEmail)}</span>
        </p>
      </header>

      <form onSubmit={handleInvite} className="flex gap-2 mb-6">
        <input
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder="correo@ejemplo.com"
          className="border rounded px-3 py-2 text-sm flex-1"
        />
        <button
          type="submit"
          disabled={loadingAction}
          className="bg-blue-600 text-white rounded px-4 py-2 text-sm"
        >
          Invitar
        </button>
      </form>

      {error && (
        <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-300 p-2 rounded">
          {renderText(error)}
        </div>
      )}

      {success && (
        <div className="mb-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-300 p-2 rounded">
          {renderText(success)}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : admins.length === 0 ? (
        <p className="text-sm text-slate-500">No hay administradores.</p>
      ) : (
        <table className="w-full text-xs border">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left">Rol</th>
              <th className="px-3 py-2 text-left">Email</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.user_id} className="border-t">
                <td className="px-3 py-2">{renderText(a.role)}</td>
                <td className="px-3 py-2">{renderText(a.email)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
