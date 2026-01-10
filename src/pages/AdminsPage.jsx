// src/pages/AdminsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../supabaseClient.js";

/**
 * AdminsPage — Blindaje definitivo contra React #300
 * Regla: NUNCA renderizar valores externos sin normalizarlos a string.
 * - Todos los textos pasan por safeText()
 * - Todas las condiciones JSX usan Boolean(...)
 * - Nunca renderizamos objetos (ni de i18n, ni de fetch, ni de errores)
 */

/** =========================
 * Helpers 100% seguros
 * ========================= */
function safeText(v, fallback = "") {
  if (v == null) return fallback;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // Evita reventar por circular refs
  try {
    const s = JSON.stringify(v);
    // Si viene "{}" o "[]" por objetos vacíos, mejor usar fallback
    if (s === "{}" || s === "[]") return fallback;
    return s;
  } catch {
    try {
      return String(v);
    } catch {
      return fallback;
    }
  }
}

function isValidEmail(email) {
  const s = String(email || "").trim();
  return s.includes("@") && s.length >= 6;
}

/**
 * Llama Edge Function invite_admin sin depender de helper libs.
 * Devuelve { ok, status, data, raw } donde data ES JSON o null.
 */
async function callInviteAdminEdge(payload) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const { data: sessData, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) {
    return {
      ok: false,
      status: 0,
      data: { ok: false, step: "get_session", message: sessErr.message },
      raw: null,
    };
  }

  const token = sessData?.session?.access_token || "";
  if (!token) {
    return {
      ok: false,
      status: 401,
      data: { ok: false, step: "no_token", message: "No hay sesión. Re-login." },
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
    data = { ok: false, step: "parse_json", message: "Respuesta no es JSON", raw };
  }

  return { ok: res.ok, status: res.status, data, raw };
}

function edgeErrorMessage(resp, fallback = "Error al enviar la invitación.") {
  if (!resp) return fallback;
  const status = safeText(resp.status, "0");
  const data = resp.data;

  if (data && typeof data === "object" && data.ok === false) {
    return `HTTP ${status} [${safeText(data.step, "edge")}] ${safeText(data.message, fallback)}`;
  }
  return `HTTP ${status} ${fallback}`;
}

/** =========================
 * Página
 * ========================= */
export default function AdminsPage() {
  const { authReady, orgsReady, currentOrg, user, isRootOwner } = useAuth();

  // UI state — SIEMPRE strings o arrays
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("admin"); // admin | owner

  const [invitedVia, setInvitedVia] = useState("");
  const [actionLink, setActionLink] = useState("");
  const [lastInvitedEmail, setLastInvitedEmail] = useState("");

  // Debug strings (jamás objetos)
  const [inviteDebug, setInviteDebug] = useState({
    status: "",
    data: "",
    raw: "",
  });

  const orgName = useMemo(() => safeText(currentOrg?.name, "—"), [currentOrg?.name]);
  const orgId = useMemo(() => safeText(currentOrg?.id, ""), [currentOrg?.id]);
  const userEmail = useMemo(() => safeText(user?.email, "—"), [user?.email]);

  const showError = Boolean(error);
  const showSuccess = Boolean(success);
  const showInviteResult = Boolean(invitedVia || actionLink);

  // Guard: sesión/org listos
  if (!authReady || !orgsReady) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Cargando tu sesión y organización…
        </div>
      </div>
    );
  }

  // Guard: solo root owner
  if (!isRootOwner) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold text-slate-900">Administradores</h1>
        <p className="mt-2 text-sm text-slate-600">Este módulo es exclusivo del propietario.</p>
      </div>
    );
  }

  // Guard: org requerida
  if (!orgId) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se encontró la organización actual.
        </div>
      </div>
    );
  }

  /** =========================
   * Cargar admins
   * ========================= */
  async function fetchAdmins() {
    // IMPORTANTE: aquí usa tu fuente real.
    // En tu proyecto original esto venía de un helper listAdmins().
    // Para universalidad, lo hacemos directo sobre la tabla/view que ya uses.
    // ✅ Ajusta el nombre si tu tabla es distinta.
    //
    // Por defecto intentamos una vista/tabla típica: org_admins (si existe),
    // y si no, intentamos memberships filtrando role owner/admin.
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // 1) Intenta org_admins (si existe)
      let data = null;
      let error1 = null;

      const r1 = await supabase
        .from("org_admins")
        .select("user_id, email, role, created_at")
        .eq("org_id", orgId);

      if (r1?.error) {
        error1 = r1.error;
      } else {
        data = r1.data || [];
      }

      // 2) Fallback a memberships + profiles (si org_admins no existe)
      if (error1) {
        const r2 = await supabase
          .from("memberships")
          .select("user_id, role, created_at, profiles:profiles(email)")
          .eq("org_id", orgId)
          .in("role", ["owner", "admin"]);

        if (r2?.error) throw r2.error;

        data = (r2.data || []).map((m) => ({
          user_id: m.user_id,
          role: m.role,
          email: m.profiles?.email,
          created_at: m.created_at,
        }));
      }

      setAdmins(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("[AdminsPage] fetchAdmins error:", e);
      setError(safeText(e?.message, "No se pudo cargar la lista de administradores."));
      setAdmins([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  /** =========================
   * Invitar admin/owner
   * ========================= */
  const handleInvite = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setInvitedVia("");
    setActionLink("");
    setLastInvitedEmail("");
    setInviteDebug({ status: "", data: "", raw: "" });

    const email = String(inviteEmail || "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      setError("Ingresa un correo electrónico válido.");
      return;
    }

    setLoadingAction(true);
    try {
      const payload =
        inviteRole === "owner"
          ? { email, role: "owner", org_name: email } // nueva org
          : { email, role: "admin", org_id: orgId }; // misma org

      const resp = await callInviteAdminEdge(payload);

      // Guardar debug siempre string
      setInviteDebug({
        status: safeText(resp.status, ""),
        data: safeText(resp.data, ""),
        raw: safeText(resp.raw, ""),
      });

      if (!resp.ok) {
        setError(edgeErrorMessage(resp));
        return;
      }

      const data = resp.data || {};
      if (data && typeof data === "object" && data.ok === false) {
        setError(edgeErrorMessage(resp, "La invitación no pudo ser enviada."));
        return;
      }

      const via = safeText(data?.invited_via, data?.action_link ? "action_link" : "");
      const link = safeText(data?.action_link, "");

      setLastInvitedEmail(email);
      setInvitedVia(via);
      setActionLink(link);

      if (via === "email") {
        setSuccess(`Invitación enviada por correo a ${email}. (Revisa Spam/Promociones)`);
      } else if (via === "action_link") {
        setSuccess(`Copia el Magic Link y envíalo a ${email} (abrir en Chrome/Safari).`);
      } else {
        setSuccess(`Invitación procesada para ${email}.`);
      }

      setInviteEmail("");
      await fetchAdmins();
    } catch (e) {
      console.error("[AdminsPage] invite error:", e);
      setError(`Error inesperado: ${safeText(e?.message || e)}`);
    } finally {
      setLoadingAction(false);
    }
  };

  /** =========================
   * Eliminar admin (membership)
   * ========================= */
  const handleDelete = async (row) => {
    const uid = safeText(row?.user_id, "");
    if (!uid) return;

    if (!window.confirm("¿Eliminar este administrador?")) return;

    setLoadingAction(true);
    setError("");
    setSuccess("");

    try {
      // ✅ Ajusta si tu backend usa otra función.
      // Aquí eliminamos membership org_id + user_id (admin).
      const { error: delErr } = await supabase
        .from("memberships")
        .delete()
        .eq("org_id", orgId)
        .eq("user_id", uid);

      if (delErr) throw delErr;

      setAdmins((prev) =>
        Array.isArray(prev) ? prev.filter((a) => safeText(a?.user_id) !== uid) : []
      );
      setSuccess("Administrador eliminado.");
    } catch (e) {
      console.error("[AdminsPage] delete error:", e);
      setError(safeText(e?.message, "No se pudo eliminar al administrador."));
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCopy = async () => {
    if (!actionLink) return;
    try {
      await navigator.clipboard.writeText(actionLink);
      setSuccess("Magic Link copiado. Envíalo por WhatsApp/Email (abrir en Chrome/Safari).");
    } catch {
      setError("No se pudo copiar el link. Copia manualmente desde el recuadro.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Administradores actuales</h1>
        <p className="text-sm text-slate-600 mt-1">
          Organización: <b>{orgName}</b>
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Usuario: <span className="font-mono">{userEmail}</span>
        </p>
      </header>

      {/* Invitación */}
      <section className="mb-8 border rounded-xl p-4 bg-white">
        <h2 className="text-sm font-semibold mb-2">Invitar nuevo administrador</h2>

        <form onSubmit={handleInvite} className="flex flex-col md:flex-row gap-3">
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

        {showInviteResult ? (
          <div className="mt-4 border rounded-lg p-3 bg-slate-50">
            <div className="text-xs text-slate-700">
              Invitado: <b>{safeText(lastInvitedEmail, "—")}</b>
            </div>

            {actionLink ? (
              <div className="mt-2">
                <div className="flex gap-2 items-center mb-2">
                  <button
                    type="button"
                    onClick={handleCopy}
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
                  {safeText(actionLink)}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Debug (solo texto) */}
        {Boolean(inviteDebug.status) ? (
          <details className="mt-4">
            <summary className="text-xs cursor-pointer text-slate-600">Debug (invite_admin)</summary>
            <div className="mt-2 text-[11px] bg-slate-50 border rounded p-2 space-y-2">
              <div>
                <b>Status:</b> <span className="font-mono">{safeText(inviteDebug.status)}</span>
              </div>
              <div>
                <b>Data (string):</b>
                <div className="font-mono break-all select-all mt-1">{safeText(inviteDebug.data)}</div>
              </div>
              {inviteDebug.raw ? (
                <div>
                  <b>Raw:</b>
                  <div className="font-mono break-all select-all mt-1">{safeText(inviteDebug.raw)}</div>
                </div>
              ) : null}
            </div>
          </details>
        ) : null}
      </section>

      {showError ? (
        <div className="bg-red-50 border border-red-300 text-red-700 p-2 rounded text-xs mb-3">
          {safeText(error)}
        </div>
      ) : null}

      {showSuccess ? (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-700 p-2 rounded text-xs mb-3">
          {safeText(success)}
        </div>
      ) : null}

      {/* Lista */}
      <section className="border rounded-xl bg-white">
        <div className="flex justify-between items-center px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">Administradores</h2>
          <button
            type="button"
            onClick={() => fetchAdmins()}
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
              {admins.map((adm, idx) => {
                const key = safeText(adm?.user_id, `adm-${idx}`);
                return (
                  <tr key={key} className="border-t">
                    <td className="px-3 py-2">{safeText(adm?.role, "—")}</td>
                    <td className="px-3 py-2">{safeText(adm?.email, "—")}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(adm)}
                        disabled={loadingAction}
                        className="text-red-600 border border-red-500 rounded px-2 py-1 text-xs disabled:opacity-60"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
