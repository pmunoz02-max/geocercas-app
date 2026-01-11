// src/pages/AdminsPage.jsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../supabaseClient.js";

/**
 * AdminsPage — v8 FINAL (fix definitivo React #300)
 * Causa real detectada: inviteDebug.data llegaba como object y se renderizaba en JSX.
 * Solución: inviteDebug SIEMPRE strings (JSON string), jamás objeto.
 */

function uiText(value, fallback = "—") {
  const t = typeof value;
  if (value == null) return fallback;
  if (t === "string") return value;
  if (t === "number" || t === "boolean") return String(value);

  // Si llega objeto/array/error: convertir a string seguro
  try {
    return JSON.stringify(value);
  } catch {
    try {
      return String(value);
    } catch {
      return fallback;
    }
  }
}

function safeJsonString(value, fallback = "") {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    try {
      return String(value);
    } catch {
      return fallback;
    }
  }
}

function isValidEmail(email) {
  const s = String(email || "").trim();
  return s.includes("@") && s.length >= 6;
}

class SafeBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, msg: "", stack: "" };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, msg: uiText(err?.message || err, "Error de render") };
  }
  componentDidCatch(err, info) {
    const stack = uiText(info?.componentStack || "", "");
    this.setState({ stack });
    console.error("[AdminsPage] Render error caught:", err);
    console.error("[AdminsPage] Component stack:", stack);
  }
  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-semibold">Error de render aislado (AdminsPage)</div>
          <div className="mt-2 break-words">{uiText(this.state.msg, "Error")}</div>
          {this.state.stack ? (
            <pre className="mt-3 whitespace-pre-wrap text-[11px] text-red-700 bg-white/60 border border-red-200 rounded p-2">
              {uiText(this.state.stack, "")}
            </pre>
          ) : null}
          <div className="mt-3 text-[11px] text-red-700">
            Abre consola y busca: <span className="font-mono">[AdminsPage]</span>
          </div>
        </div>
      </div>
    );
  }
}

async function callInviteAdminEdge(payload) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const { data: sessData, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) {
    return { ok: false, status: 0, data: { ok: false, step: "get_session", message: sessErr.message }, raw: "" };
  }

  const token = sessData?.session?.access_token || "";
  if (!token) {
    return { ok: false, status: 401, data: { ok: false, step: "no_token", message: "No hay sesión. Re-login." }, raw: "" };
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
  const status = uiText(resp.status, "0");
  const data = resp.data;

  if (data && typeof data === "object" && data.ok === false) {
    return `HTTP ${status} [${uiText(data.step, "edge")}] ${uiText(data.message, fallback)}`;
  }
  return `HTTP ${status} ${fallback}`;
}

async function loadAdminsForOrg(orgId) {
  const r1 = await supabase
    .from("memberships")
    .select("user_id, role, created_at")
    .eq("org_id", orgId)
    .in("role", ["owner", "admin"]);

  if (r1?.error) throw r1.error;

  const memberships = Array.isArray(r1.data) ? r1.data : [];
  const userIds = Array.from(new Set(memberships.map((m) => m.user_id).filter(Boolean)));

  const emailById = new Map();
  if (userIds.length) {
    const r2 = await supabase.from("profiles").select("id, email").in("id", userIds);
    if (r2?.error) throw r2.error;
    for (const p of r2.data || []) emailById.set(p.id, p.email);
  }

  return memberships.map((m) => ({
    user_id: m.user_id,
    role: m.role,
    email: emailById.get(m.user_id) || "",
    created_at: m.created_at,
  }));
}

function AdminsPageInner() {
  const { authReady, orgsReady, currentOrg, user, isRootOwner } = useAuth();

  const orgId = typeof currentOrg?.id === "string" ? currentOrg.id : "";
  const orgName = typeof currentOrg?.name === "string" ? currentOrg.name : "";
  const userEmail = typeof user?.email === "string" ? user.email : "";

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("admin");

  const [actionLink, setActionLink] = useState("");
  const [lastInvitedEmail, setLastInvitedEmail] = useState("");

  // ✅ DEBUG SIEMPRE STRINGS (nunca object)
  const [inviteDebug, setInviteDebug] = useState({ status: "", data: "", raw: "" });

  const fetchAdmins = async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const rows = await loadAdminsForOrg(orgId);
      setAdmins(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(uiText(e?.message ?? e, "No se pudo cargar la lista de administradores."));
      setAdmins([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!orgId) return;
    fetchAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  if (!authReady || !orgsReady) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Cargando tu sesión y organización…
        </div>
      </div>
    );
  }

  if (!isRootOwner) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold text-slate-900">Administradores</h1>
        <p className="mt-2 text-sm text-slate-600">Este módulo es exclusivo del propietario.</p>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se encontró la organización actual (org_id inválido).
        </div>
      </div>
    );
  }

  const handleInvite = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
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
          ? { email, role: "owner", org_name: email }
          : { email, role: "admin", org_id: orgId };

      const resp = await callInviteAdminEdge(payload);

      // ✅ IMPORTANTE: guardar SOLO strings, nunca objetos
      setInviteDebug({
        status: uiText(resp.status, ""),
        data: safeJsonString(resp.data, ""), // <-- aquí está el fix definitivo
        raw: uiText(resp.raw, ""),
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

      const link = typeof data?.action_link === "string" ? data.action_link : "";
      setLastInvitedEmail(email);
      setActionLink(link);

      if (link) {
        setSuccess(`Invitación generada para ${email}. Copia el Magic Link (si el correo no llega).`);
      } else {
        setSuccess(`Invitación procesada para ${email}.`);
      }

      setInviteEmail("");
      await fetchAdmins();
    } catch (e2) {
      setError(`Error inesperado: ${uiText(e2?.message ?? e2, "Error")}`);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCopy = async () => {
    if (!actionLink) return;
    try {
      await navigator.clipboard.writeText(actionLink);
      setSuccess("Magic Link copiado.");
    } catch {
      setError("No se pudo copiar el link. Copia manualmente desde el recuadro.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Administradores actuales</h1>
        <p className="text-sm text-slate-600 mt-1">
          Organización: <b>{uiText(orgName, "—")}</b>
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Usuario: <span className="font-mono">{uiText(userEmail, "—")}</span>
        </p>
      </header>

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

        {actionLink ? (
          <div className="mt-4 border rounded-lg p-3 bg-slate-50">
            <div className="text-xs text-slate-700">
              Invitado: <b>{uiText(lastInvitedEmail, "—")}</b>
            </div>

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
                {uiText(actionLink, "")}
              </div>
              <div className="mt-2 text-[11px] text-slate-600">
                Si el correo no llega, envía este link por WhatsApp/Telegram.
              </div>
            </div>
          </div>
        ) : null}

        {inviteDebug.status ? (
          <details className="mt-4">
            <summary className="text-xs cursor-pointer text-slate-600">Debug (invite_admin)</summary>
            <div className="mt-2 text-[11px] bg-slate-50 border rounded p-2 space-y-2">
              <div>
                <b>Status:</b> <span className="font-mono">{uiText(inviteDebug.status, "")}</span>
              </div>
              <div>
                <b>Data (JSON string):</b>
                <pre className="mt-1 font-mono whitespace-pre-wrap break-words">{uiText(inviteDebug.data, "")}</pre>
              </div>
              {inviteDebug.raw ? (
                <div>
                  <b>Raw:</b>
                  <pre className="mt-1 font-mono whitespace-pre-wrap break-words">{uiText(inviteDebug.raw, "")}</pre>
                </div>
              ) : null}
            </div>
          </details>
        ) : null}
      </section>

      {error ? (
        <div className="bg-red-50 border border-red-300 text-red-700 p-2 rounded text-xs mb-3">
          {uiText(error, "")}
        </div>
      ) : null}

      {success ? (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-700 p-2 rounded text-xs mb-3">
          {uiText(success, "")}
        </div>
      ) : null}

      <section className="border rounded-xl bg-white">
        <div className="flex justify-between items-center px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">Administradores</h2>
          <button
            type="button"
            onClick={fetchAdmins}
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
                const key =
                  typeof adm?.user_id === "string" && adm.user_id ? adm.user_id : `adm-${idx}`;
                return (
                  <tr key={key} className="border-t">
                    <td className="px-3 py-2">{uiText(adm?.role, "—")}</td>
                    <td className="px-3 py-2">{uiText(adm?.email, "—")}</td>
                    <td className="px-3 py-2 text-right">—</td>
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

export default function AdminsPage() {
  return (
    <SafeBoundary>
      <AdminsPageInner />
    </SafeBoundary>
  );
}
