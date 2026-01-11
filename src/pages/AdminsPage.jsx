// src/pages/AdminsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../supabaseClient.js";

/**
 * AdminsPage — v7 FINAL (anti React #300)
 *
 * Objetivos:
 * 1) Eliminar definitivamente React error #300 ("Objects are not valid as a React child") en AdminsPage.
 * 2) Invitación admin estable: si el correo NO llega, siempre mostramos el Magic Link si el Edge lo entrega.
 * 3) Logs útiles y permanentes: cuando detectemos valores no-primitive en UI, log + snapshot.
 *
 * Regla:
 * - Datos lógicos (orgId, payloads, keys) NO pasan por stringify defensivo.
 * - Solo el texto visible pasa por uiText().
 */

function uiText(label, value, fallback = "—") {
  const t = typeof value;

  if (value == null) return fallback;
  if (t === "string") return value;
  if (t === "number" || t === "boolean") return String(value);

  // Si llega objeto/array/error: loggear SIEMPRE, y mostrar preview seguro (string).
  let preview = "";
  try {
    preview = JSON.stringify(value);
  } catch {
    try {
      preview = String(value);
    } catch {
      preview = "";
    }
  }

  const snapshot = {
    label,
    typeof: t,
    preview: (preview || "").slice(0, 1200),
  };

  try {
    window.__ADMINS_LAST_BAD_RENDER = snapshot;
  } catch {
    // ignore
  }

  // eslint-disable-next-line no-console
  console.warn("[AdminsPage] BAD RENDER VALUE ->", { ...snapshot, value });

  return preview || fallback;
}

function isValidEmail(email) {
  const s = String(email || "").trim();
  return s.includes("@") && s.length >= 6;
}

class SafeBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, msg: "", info: "" };
  }
  static getDerivedStateFromError(err) {
    const msg = (err && err.message) ? String(err.message) : String(err || "Error de render");
    return { hasError: true, msg };
  }
  componentDidCatch(err, info) {
    const stack = info?.componentStack ? String(info.componentStack) : "";
    this.setState({ info: stack });
    // eslint-disable-next-line no-console
    console.error("[AdminsPage] Render error caught:", err, info);
    try {
      // eslint-disable-next-line no-console
      console.error("[AdminsPage] LAST BAD RENDER SNAPSHOT:", window.__ADMINS_LAST_BAD_RENDER);
    } catch {
      // ignore
    }
  }
  render() {
    if (!this.state.hasError) return this.props.children;

    const snap = (() => {
      try {
        return window.__ADMINS_LAST_BAD_RENDER || null;
      } catch {
        return null;
      }
    })();

    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-semibold">Error de render aislado (AdminsPage)</div>
          <div className="mt-2 break-words">{uiText("boundary.msg", this.state.msg, "Error")}</div>

          {snap ? (
            <div className="mt-3 text-[12px] bg-white/70 border border-red-200 rounded p-2">
              <div className="font-semibold mb-1">Último valor sospechoso</div>
              <div><b>label:</b> {uiText("boundary.snap.label", snap.label, "")}</div>
              <div><b>typeof:</b> {uiText("boundary.snap.typeof", snap.typeof, "")}</div>
              <div className="mt-1"><b>preview:</b></div>
              <pre className="whitespace-pre-wrap text-[11px]">{uiText("boundary.snap.preview", snap.preview, "")}</pre>
            </div>
          ) : null}

          {this.state.info ? (
            <pre className="mt-3 whitespace-pre-wrap text-[11px] text-red-700 bg-white/60 border border-red-200 rounded p-2">
              {uiText("boundary.componentStack", this.state.info, "")}
            </pre>
          ) : null}

          <div className="mt-3 text-[11px] text-red-700">
            Abre consola y busca: <span className="font-mono">[AdminsPage] BAD RENDER VALUE</span>
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
    return { ok: false, status: 0, data: { ok: false, step: "get_session", message: sessErr.message }, raw: null };
  }

  const token = sessData?.session?.access_token || "";
  if (!token) {
    return { ok: false, status: 401, data: { ok: false, step: "no_token", message: "No hay sesión. Re-login." }, raw: null };
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
  const status = uiText("edge.status", resp.status, "0");
  const data = resp.data;

  if (data && typeof data === "object" && data.ok === false) {
    return `HTTP ${status} [${uiText("edge.step", data.step, "edge")}] ${uiText("edge.message", data.message, fallback)}`;
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

  let emailById = new Map();
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

  // IDs / lógica: sin stringify defensivo
  const orgId = (typeof currentOrg?.id === "string") ? currentOrg.id : "";
  const orgName = (typeof currentOrg?.name === "string") ? currentOrg.name : "";
  const userEmail = (typeof user?.email === "string") ? user.email : "";

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("admin");

  const [invitedVia, setInvitedVia] = useState("");
  const [actionLink, setActionLink] = useState("");
  const [lastInvitedEmail, setLastInvitedEmail] = useState("");

  const [inviteDebug, setInviteDebug] = useState({ status: "", data: "", raw: "" });

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
    uiText("org.id.invalid", currentOrg?.id, "");
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se encontró la organización actual (org_id inválido).
        </div>
      </div>
    );
  }

  const fetchAdmins = async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const rows = await loadAdminsForOrg(orgId);
      setAdmins(Array.isArray(rows) ? rows : []);
    } catch (e) {
      uiText("fetchAdmins.errorObject", e, "");
      setError(uiText("fetchAdmins.errorMessage", e?.message ?? e, "No se pudo cargar la lista de administradores."));
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
          ? { email, role: "owner", org_name: email }
          : { email, role: "admin", org_id: orgId };

      const resp = await callInviteAdminEdge(payload);

      setInviteDebug({
        status: uiText("inviteDebug.status", resp.status, ""),
        data: uiText("inviteDebug.data", resp.data, ""),
        raw: uiText("inviteDebug.raw", resp.raw, ""),
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

      const via = uiText("invite.via", data?.invited_via, data?.action_link ? "action_link" : "");
      const link = uiText("invite.link", data?.action_link, "");

      setLastInvitedEmail(email);
      setInvitedVia(via);
      setActionLink(link);

      // Mensaje honesto
      if (link) {
        setSuccess(`Invitación generada para ${email}. Copia el Magic Link y envíalo si no llega el correo.`);
      } else if (via === "email") {
        setSuccess(`Invitación enviada por correo a ${email}. Revisa spam/promociones.`);
      } else {
        setSuccess(`Invitación procesada para ${email}.`);
      }

      setInviteEmail("");
      await fetchAdmins();
    } catch (e2) {
      uiText("invite.errorObject", e2, "");
      setError(`Error inesperado: ${uiText("invite.errorMessage", e2?.message ?? e2, "Error")}`);
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
          Organización: <b>{uiText("org.name.ui", orgName, "—")}</b>
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Usuario: <span className="font-mono">{uiText("user.email.ui", userEmail, "—")}</span>
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

        {(invitedVia || actionLink) ? (
          <div className="mt-4 border rounded-lg p-3 bg-slate-50">
            <div className="text-xs text-slate-700">
              Invitado: <b>{uiText("invite.lastEmail", lastInvitedEmail, "—")}</b>
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
                  {uiText("invite.actionLink", actionLink, "")}
                </div>
                <div className="mt-2 text-[11px] text-slate-600">
                  Si el correo no llega, envía este link por WhatsApp/Telegram.
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {Boolean(inviteDebug.status) ? (
          <details className="mt-4">
            <summary className="text-xs cursor-pointer text-slate-600">Debug (invite_admin)</summary>
            <div className="mt-2 text-[11px] bg-slate-50 border rounded p-2 space-y-2">
              <div>
                <b>Status:</b> <span className="font-mono">{uiText("inviteDebug.status.render", inviteDebug.status, "")}</span>
              </div>
              <div>
                <b>Data:</b>
                <div className="font-mono break-all select-all mt-1">{uiText("inviteDebug.data.render", inviteDebug.data, "")}</div>
              </div>
              {inviteDebug.raw ? (
                <div>
                  <b>Raw:</b>
                  <div className="font-mono break-all select-all mt-1">{uiText("inviteDebug.raw.render", inviteDebug.raw, "")}</div>
                </div>
              ) : null}
            </div>
          </details>
        ) : null}
      </section>

      {error ? (
        <div className="bg-red-50 border border-red-300 text-red-700 p-2 rounded text-xs mb-3">
          {uiText("ui.error", error, "")}
        </div>
      ) : null}

      {success ? (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-700 p-2 rounded text-xs mb-3">
          {uiText("ui.success", success, "")}
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
                  (typeof adm?.user_id === "string" && adm.user_id) ? adm.user_id : `adm-${idx}`;
                return (
                  <tr key={key} className="border-t">
                    <td className="px-3 py-2">{uiText("row.role", adm?.role, "—")}</td>
                    <td className="px-3 py-2">{uiText("row.email", adm?.email, "—")}</td>
                    <td className="px-3 py-2 text-right">—</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <div className="mt-4 text-[11px] text-slate-500">
        Debug: <span className="font-mono">window.__ADMINS_LAST_BAD_RENDER</span>
      </div>
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
