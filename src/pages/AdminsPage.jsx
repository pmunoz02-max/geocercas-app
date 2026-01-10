// src/pages/AdminsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabase.js";
import { listAdmins, deleteAdmin } from "../lib/adminsApi";

/**
 * Llamada directa por fetch para NO perder el body en errores 4xx/5xx.
 * Supabase JS en functions.invoke() suele devolver:
 *   Error: Edge Function returned a non-2xx status code
 * ...y te oculta el JSON de respuesta.
 */
async function callInviteAdminEdge(payload) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const { data: sessData, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) {
    return {
      ok: false,
      status: 0,
      data: { ok: false, step: "get_session", message: sessErr.message, details: sessErr },
      raw: null,
    };
  }

  const token = sessData?.session?.access_token || "";
  if (!token) {
    return {
      ok: false,
      status: 401,
      data: { ok: false, step: "no_token", message: "No hay token de sesión. Re-login." },
      raw: null,
    };
  }

  const url = `${supabaseUrl}/functions/v1/invite_admin`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = { ok: false, step: "parse_json", message: "La función no devolvió JSON válido", raw };
  }

  return { ok: res.ok, status: res.status, data, raw };
}

function toSafeString(x, fallback = "") {
  if (x == null) return fallback;
  if (typeof x === "string") return x;
  if (typeof x === "number" || typeof x === "boolean") return String(x);
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

function extractEdgeError(fetchResp, fallback = "Error al enviar la invitación.") {
  if (!fetchResp) return fallback;

  const { status, data, raw } = fetchResp;

  // Si vino JSON estándar { ok:false, step, message, details }
  if (data && data.ok === false) {
    const step = data.step || "edge";
    const msg = data.message || data.error || fallback;
    return `HTTP ${status} [${step}] ${msg}`;
  }

  // Si vino algo raro
  if (!data) {
    return `HTTP ${status} ${fallback}${raw ? ` | raw: ${raw.slice(0, 180)}` : ""}`;
  }

  return `HTTP ${status} ${fallback} | ${toSafeString(data).slice(0, 180)}`;
}

export default function AdminsPage() {
  const { authReady, orgsReady, currentOrg, user, isRootOwner } = useAuth();

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("admin"); // admin | owner

  const [invitedVia, setInvitedVia] = useState(null);
  const [actionLink, setActionLink] = useState(null);
  const [lastInvitedEmail, setLastInvitedEmail] = useState(null);

  const orgName = useMemo(() => currentOrg?.name || "—", [currentOrg?.name]);

  const resetInviteResult = () => {
    setInvitedVia(null);
    setActionLink(null);
    setLastInvitedEmail(null);
  };

  // -------------------------
  // Guardas de carga
  // -------------------------
  if (!authReady || !orgsReady) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          Cargando tu sesión y organización actual…
        </div>
      </div>
    );
  }

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

  if (!currentOrg?.id) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se encontró la organización actual.
        </div>
      </div>
    );
  }

  // -------------------------
  // Cargar admins
  // -------------------------
  useEffect(() => {
    const fetchAdmins = async () => {
      setLoading(true);
      setError("");
      setSuccessMessage("");

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
  }, [currentOrg.id]);

  const handleRefresh = async () => {
    setLoading(true);
    setError("");
    setSuccessMessage("");

    const resp = await listAdmins(currentOrg.id);
    const { data, error: fetchError } = resp || {};

    if (fetchError) setError(fetchError.message || "No se pudo actualizar la lista de administradores.");
    else setAdmins(data || []);

    setLoading(false);
  };

  // -------------------------
  // INVITE (fetch directo)
  // -------------------------
  const handleInviteSubmit = async (e) => {
    e.preventDefault();

    const email = inviteEmail.trim().toLowerCase();
    setError("");
    setSuccessMessage("");
    resetInviteResult();

    if (!email || !email.includes("@")) {
      setError("Ingresa un correo electrónico válido.");
      return;
    }

    setLoadingAction(true);

    try {
      // Payload alineado con tu Edge Function
      const payload =
        inviteRole === "admin"
          ? { email, role: "admin", org_id: currentOrg.id }
          : { email, role: "owner", org_name: email };

      console.log("[AdminsPage] INVITE payload", payload);

      const resp = await callInviteAdminEdge(payload);

      // 🔥 Aquí por fin veremos el JSON real aunque sea 500
      console.log("[AdminsPage] INVITE fetch status:", resp.status);
      console.log("[AdminsPage] INVITE fetch data:", resp.data);

      if (!resp.ok) {
        setError(extractEdgeError(resp, "Error al enviar la invitación."));
        return;
      }

      const data = resp.data || {};
      if (data.ok === false) {
        setError(extractEdgeError(resp, "La invitación no pudo ser enviada."));
        return;
      }

      const via = data.invited_via || (data.action_link ? "action_link" : null);
      const link = data.action_link || null;

      setLastInvitedEmail(email);
      setInvitedVia(via);
      setActionLink(link);

      if (via === "email") {
        setSuccessMessage(`Invitación enviada por correo a ${email}. (Revisa Spam/Promociones)`);
      } else if (via === "action_link") {
        setSuccessMessage(`Copia el Magic Link y envíalo a ${email} (abrir en Chrome/Safari).`);
      } else {
        setSuccessMessage(`Invitación procesada para ${email}.`);
      }

      setInviteEmail("");
      await handleRefresh();
    } catch (err) {
      console.error("[AdminsPage] exception:", err);
      setError(`Error inesperado: ${toSafeString(err?.message || err)}`);
    } finally {
      setLoadingAction(false);
    }
  };

  // -------------------------
  // DELETE
  // -------------------------
  const handleDelete = async (adm) => {
    if (!window.confirm("¿Eliminar este administrador?")) return;

    setLoadingAction(true);
    setError("");
    setSuccessMessage("");

    const resp = await deleteAdmin(currentOrg.id, adm.user_id);
    const { error: delErr } = resp || {};

    if (delErr) setError(delErr.message || "No se pudo eliminar al administrador.");
    else setAdmins((prev) => prev.filter((a) => a.user_id !== adm.user_id));

    setLoadingAction(false);
  };

  const handleCopyMagicLink = async () => {
    if (!actionLink) return;
    try {
      await navigator.clipboard.writeText(actionLink);
      setSuccessMessage("Magic Link copiado. Envíalo por WhatsApp/Email (abrir en Chrome/Safari).");
    } catch {
      setError("No se pudo copiar el link. Copia manualmente desde el recuadro.");
    }
  };

  // -------------------------
  // UI
  // -------------------------
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
            className="bg-blue-600 text-white rounded px-4 py-2 text-sm disabled:opacity-60"
          >
            {loadingAction ? "Procesando..." : "Invitar"}
          </button>
        </form>

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
                <div className="bg-white border rounded p-2 text-[11px] break-all select-all">
                  {actionLink}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {!!error && (
        <div className="bg-red-50 border border-red-300 text-red-700 p-2 rounded text-xs mb-3">
          {toSafeString(error)}
        </div>
      )}

      {!!successMessage && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-700 p-2 rounded text-xs mb-3">
          {toSafeString(successMessage)}
        </div>
      )}

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
