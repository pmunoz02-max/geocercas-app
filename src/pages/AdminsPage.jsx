// src/pages/AdminsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import {
  listAdmins,
  inviteAdmin,
  inviteIndependentOwner,
  deleteAdmin,
} from "../lib/adminsApi";

// Helper: intenta sacar el mensaje real (step/message) del backend o del wrapper
function extractEdgeError(response, fallback = "Error al enviar la invitación.") {
  if (!response) return fallback;

  // Formato típico: { data, error }
  const { data, error } = response;

  // 1) Si supabase-js devolvió error (non-2xx, network, etc.)
  if (error) {
    // A veces el wrapper mete info en error.normalized o error.context
    const step =
      error?.normalized?.step ||
      error?.context?.step ||
      error?.step ||
      null;

    const msg =
      error?.normalized?.message ||
      error?.message ||
      fallback;

    const details =
      error?.normalized?.details ||
      error?.details ||
      error?.context ||
      null;

    // Si hay step, lo mostramos con más señal
    if (step) return `[${step}] ${msg}`;
    return msg;
  }

  // 2) Si el backend respondió JSON con ok:false
  if (data && data.ok === false) {
    const step = data.step || "backend";
    const msg = data.message || data.error || fallback;
    return `[${step}] ${msg}`;
  }

  // 3) Si el backend respondió un payload distinto con "error"
  if (data && data.error) {
    const step = data.step || "backend";
    const msg = typeof data.error === "string" ? data.error : fallback;
    return `[${step}] ${msg}`;
  }

  return fallback;
}

export default function AdminsPage() {
  // ROOT OWNER global
  const { currentOrg, user, isRootOwner } = useAuth();

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);

  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("admin");

  // Resultado de invitación
  const [invitedVia, setInvitedVia] = useState(null); // "email" | "action_link" | null
  const [actionLink, setActionLink] = useState(null); // string | null
  const [lastInvitedEmail, setLastInvitedEmail] = useState(null);

  const orgName = useMemo(() => currentOrg?.name || "—", [currentOrg?.name]);

  // ===========================================================
  // Cargar administradores (SOLO ROOT OWNER)
  // ===========================================================
  useEffect(() => {
    if (!isRootOwner) {
      setLoading(false);
      return;
    }

    if (!currentOrg?.id) {
      setError("No se encontró la organización actual.");
      setLoading(false);
      return;
    }

    const fetchAdmins = async () => {
      setLoading(true);
      setError(null);
      setSuccessMessage(null);

      const resp = await listAdmins(currentOrg.id);
      const { data, error: fetchError } = resp || {};

      if (fetchError) {
        console.error("[AdminsPage] listAdmins error:", fetchError, resp);
        setError(fetchError.message || "No se pudo cargar la lista de administradores.");
      } else {
        setAdmins(data || []);
      }

      setLoading(false);
    };

    fetchAdmins();
  }, [currentOrg?.id, isRootOwner]);

  // ===========================================================
  // Refresh manual
  // ===========================================================
  const handleRefresh = async () => {
    if (!currentOrg?.id || !isRootOwner) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const resp = await listAdmins(currentOrg.id);
    const { data, error: fetchError } = resp || {};

    if (fetchError) {
      setError(fetchError.message || "No se pudo actualizar la lista de administradores.");
    } else {
      setAdmins(data || []);
    }
    setLoading(false);
  };

  const resetInviteResult = () => {
    setInvitedVia(null);
    setActionLink(null);
    setLastInvitedEmail(null);
  };

  // ===========================================================
  // INVITAR NUEVO ADMINISTRADOR
  // ===========================================================
  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    if (!isRootOwner) return;

    const email = inviteEmail.trim().toLowerCase();

    setError(null);
    setSuccessMessage(null);
    resetInviteResult();

    if (!currentOrg?.id) {
      setError("No se encontró la organización actual.");
      return;
    }

    if (!email || !email.includes("@")) {
      setError("Ingresa un correo electrónico válido.");
      return;
    }

    setLoadingAction(true);

    try {
      let response;

      // DEBUG (puedes dejarlo, no molesta en prod; si quieres lo quitamos luego)
      console.log("[AdminsPage] INVITE start", {
        inviteRole,
        orgId: currentOrg.id,
        email,
      });

      if (inviteRole === "admin") {
        // admin (misma org)
        // OJO: manda role en lowercase para evitar ambigüedad
        response = await inviteAdmin(currentOrg.id, { email, role: "admin" });
      } else if (inviteRole === "owner") {
        // owner (nueva org)
        response = await inviteIndependentOwner({ email, full_name: null });
      }

      console.log("[AdminsPage] INVITE raw response:", response);

      const { error: fnError, data } = response || {};

      if (fnError) {
        const msg = extractEdgeError(response, "Error al enviar la invitación.");
        setError(msg);
        return;
      }

      if (data && data.ok === false) {
        const msg = extractEdgeError({ data, error: null }, "La invitación no pudo ser enviada.");
        setError(msg);
        return;
      }

      // Contrato: invited_via + action_link
      const via = data?.invited_via || (data?.action_link ? "action_link" : null);
      const link = data?.action_link || null;

      setLastInvitedEmail(email);
      setInvitedVia(via);
      setActionLink(link);

      // Mensaje UX
      if (via === "email") {
        setSuccessMessage(
          `Invitación enviada por correo a ${email}. (Si no llega, revisa Spam/Promociones)`
        );
      } else if (via === "action_link") {
        setSuccessMessage(
          `No se pudo enviar correo automáticamente. Copia el Magic Link y envíalo a ${email} (NO uses /inicio).`
        );
      } else {
        setSuccessMessage(`Invitación procesada para ${email}.`);
      }

      setInviteEmail("");
      await handleRefresh();
    } catch (err) {
      console.error("[AdminsPage] excepción:", err);
      setError(err?.message || "Error inesperado al enviar la invitación.");
    } finally {
      setLoadingAction(false);
    }
  };

  // ===========================================================
  // DELETE
  // ===========================================================
  const handleDelete = async (adm) => {
    if (!currentOrg?.id || !isRootOwner) return;
    if (!window.confirm("¿Eliminar este administrador?")) return;

    setLoadingAction(true);
    setError(null);
    setSuccessMessage(null);

    const resp = await deleteAdmin(currentOrg.id, adm.user_id);
    const { error: delErr } = resp || {};

    if (delErr) {
      setError(delErr.message || "No se pudo eliminar al administrador.");
    } else {
      setAdmins((prev) => prev.filter((a) => a.user_id !== adm.user_id));
    }

    setLoadingAction(false);
  };

  const handleCopyMagicLink = async () => {
    if (!actionLink) return;
    try {
      await navigator.clipboard.writeText(actionLink);
      setSuccessMessage("Magic Link copiado. Envíalo por WhatsApp/Email (abrir en Chrome/Safari).");
    } catch (e) {
      setError("No se pudo copiar el link. Copia manualmente desde el recuadro.");
    }
  };

  // ===========================================================
  // UI – BLOQUEO DEFINITIVO
  // ===========================================================
  if (!isRootOwner) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-xl font-semibold text-slate-900 mb-2">Administradores</h1>
        <p className="text-sm text-slate-600">
          Este módulo es de uso exclusivo del propietario de la aplicación.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Administradores actuales</h1>
        <p className="text-sm text-slate-600 mt-1">
          Organización: <b>{orgName}</b>
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Usuario: <span className="font-mono">{user?.email}</span>
        </p>
      </header>

      {/* INVITAR */}
      <section className="mb-8 border rounded-xl p-4 bg-white">
        <h2 className="text-sm font-semibold mb-2">Invitar nuevo administrador</h2>

        <div className="text-xs text-slate-600 mb-3">
          Importante: el acceso funciona solo con el <b>Magic Link real</b> (con tokens).{" "}
          <b>No</b> envíes links como <span className="font-mono">/inicio</span>. Si compartes por WhatsApp,
          pide que lo abran en <b>Chrome/Safari</b> (no en el preview).
        </div>

        <form onSubmit={handleInviteSubmit} className="flex flex-col md:flex-row gap-3">
          <input
            type="email"
            placeholder="correo@ejemplo.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="border rounded px-3 py-2 text-sm flex-1"
          />

          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="admin">Admin (misma org)</option>
            <option value="owner">Owner (nueva org)</option>
          </select>

          <button
            type="submit"
            disabled={loadingAction}
            className="bg-blue-600 text-white rounded px-4 py-2 text-sm"
          >
            {loadingAction ? "Procesando..." : "Invitar"}
          </button>
        </form>

        {/* Resultado: correo o link */}
        {(invitedVia || actionLink) && (
          <div className="mt-4 border rounded-lg p-3 bg-slate-50">
            <div className="text-xs text-slate-700">
              Invitado: <b>{lastInvitedEmail}</b>
            </div>

            {invitedVia === "email" ? (
              <div className="text-xs text-emerald-700 mt-1">
                ✅ Invitación enviada por correo. (Revisar Spam/Promociones)
              </div>
            ) : invitedVia === "action_link" ? (
              <div className="text-xs text-amber-700 mt-1">
                ⚠️ No se pudo enviar correo automáticamente. Usa este Magic Link real:
              </div>
            ) : null}

            {actionLink && (
              <div className="mt-2">
                <div className="flex gap-2 items-center mb-2">
                  <button
                    type="button"
                    onClick={handleCopyMagicLink}
                    className="bg-emerald-600 text-white rounded px-3 py-1.5 text-xs"
                  >
                    Copiar Magic Link
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(actionLink, "_blank", "noopener,noreferrer")}
                    className="border rounded px-3 py-1.5 text-xs"
                  >
                    Probar link
                  </button>
                </div>
                <div className="text-[11px] text-slate-500 mb-2">
                  Si lo envías por WhatsApp: que lo abran en navegador (Chrome/Safari), no en el preview.
                </div>
                <div className="bg-white border rounded p-2 text-[11px] break-all select-all">
                  {actionLink}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 p-2 rounded text-xs mb-3">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-700 p-2 rounded text-xs mb-3">
          {successMessage}
        </div>
      )}

      {/* LISTA */}
      <section className="border rounded-xl bg-white">
        <div className="flex justify-between items-center px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">Administradores</h2>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="border rounded px-3 py-1.5 text-xs"
          >
            Refrescar
          </button>
        </div>

        {loading ? (
          <p className="p-4 text-sm text-slate-500">Cargando…</p>
        ) : admins.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No hay administradores.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Rol</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((adm) => (
                <tr key={adm.user_id} className="border-t">
                  <td className="px-3 py-2">{adm.role}</td>
                  <td className="px-3 py-2">{adm.email}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => handleDelete(adm)}
                      className="text-red-600 border border-red-500 rounded px-2 py-1 text-xs"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
