import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabase.js";
import { listAdmins, deleteAdmin } from "../lib/adminsApi";

/** ========= Helpers 100% seguros ========= */
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

function safeText(x) {
  // Para render: NUNCA objeto
  return typeof x === "string" ? x : toSafeString(x, "");
}

/**
 * Llamada directa por fetch para NO perder el body en errores 4xx/5xx.
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

function extractEdgeError(fetchResp, fallback = "Error al enviar la invitación.") {
  if (!fetchResp) return fallback;

  const { status, data, raw } = fetchResp;

  if (data && data.ok === false) {
    const step = data.step || "edge";
    const msg = data.message || data.error || fallback;
    return `HTTP ${status} [${step}] ${msg}`;
  }

  if (!data) {
    return `HTTP ${status} ${fallback}${raw ? ` | raw: ${String(raw).slice(0, 180)}` : ""}`;
  }

  return `HTTP ${status} ${fallback} | ${toSafeString(data).slice(0, 180)}`;
}

/** ErrorBoundary simple para que nunca tumbe la página */
class SafeBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, msg: "" };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, msg: toSafeString(err?.message || err) };
  }
  componentDidCatch(err) {
    console.error("[AdminsPage] Render error boundary:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-300 text-red-700 p-3 rounded text-sm">
            Error de render (bloqueado para no tumbar la app): {safeText(this.state.msg)}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AdminsPage() {
  const { authReady, orgsReady, currentOrg, user, isRootOwner } = useAuth();

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);

  const [error, setError] = useState(""); // SIEMPRE string
  const [successMessage, setSuccessMessage] = useState(""); // SIEMPRE string

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
        <p className="text-sm text-slate-600">Este módulo es exclusivo del propietario.</p>
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

  useEffect(() => {
    const fetchAdmins = async () => {
      setLoading(true);
      setError("");
      setSuccessMessage("");

      const resp = await listAdmins(currentOrg.id);
      const { data, error: fetchError } = resp || {};

      if (fetchError) {
        console.error("[AdminsPage] listAdmins error:", fetchError, resp);
        setError(String(fetchError.message || "No se pudo cargar la lista de administradores."));
      } else {
        setAdmins(Array.isArray(data) ? data : []);
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

    if (fetchError) setError(String(fetchError.message || "No se pudo actualizar la lista de administradores."));
    else setAdmins(Array.isArray(data) ? data : []);

    setLoading(false);
  };

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
      const payload =
        inviteRole === "admin"
          ? { email, role: "admin", org_id: currentOrg.id }
          : { email, role: "owner", org_name: email };

      console.log("[AdminsPage] INVITE payload:", JSON.stringify(payload));

      const resp = await callInviteAdminEdge(payload);

      // 🔥 Log 100% copiable
      console.log("[AdminsPage] INVITE fetch status:", resp.status);
      console.log("[AdminsPage] INVITE fetch data JSON:", JSON.stringify(resp.data));
      if (resp.raw) console.log("[AdminsPage] INVITE raw text:", String(resp.raw).slice(0, 500));

      if (!resp.ok) {
        setError(String(extractEdgeError(resp, "Error al enviar la invitación.")));
        return;
      }

      const data = resp.data || {};
      if (data.ok === false) {
        setError(String(extractEdgeError(resp, "La invitación no pudo ser enviada.")));
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

  const handleDelete = async (adm) => {
    if (!window.confirm("¿Eliminar este administrador?")) return;

    setLoadingAction(true);
    setError("");
    setSuccessMessage("");

    const resp = await deleteAdmin(currentOrg.id, adm.user_id);
    const { error: delErr } = resp || {};

    if (delErr) setError(String(delErr.message || "No se pudo eliminar al administrador."));
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

  return (
    <SafeBoundary>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Administradores actuales</h1>
          <p className="text-sm text-slate-600 mt-1">
            Organización: <b>{safeText(orgName)}</b>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Usuario: <span className="font-mono">{safeText(user?.email)}</span>
          </p>
        </header>

        <section className="mb-8 border rounded-xl p-4 bg-white">
          <h2 className="text-sm font-semibold mb-2">Invitar nuevo administrador</h2>

          <div className="text-xs text-slate-600 mb-3">
            Importante: el acceso funciona solo con el <b>Magic Link real</b>. No envíes links como{" "}
            <span className="font-mono">/inicio</span>.
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
                Invitado: <b>{safeText(lastInvitedEmail)}</b>
              </div>

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
                    {safeText(actionLink)}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {!!error && (
          <div className="bg-red-50 border border-red-300 text-red-700 p-2 rounded text-xs mb-3">
            {safeText(error)}
          </div>
        )}

        {!!successMessage && (
          <div className="bg-emerald-50 border border-emerald-300 text-emerald-700 p-2 rounded text-xs mb-3">
            {safeText(successMessage)}
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
                    <td className="px-3 py-2">{safeText(adm.role)}</td>
                    <td className="px-3 py-2">{safeText(adm.email)}</td>
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
    </SafeBoundary>
  );
}
