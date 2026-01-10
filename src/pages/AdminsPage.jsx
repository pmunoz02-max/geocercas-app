// src/pages/AdminsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../supabaseClient.js";

/**
 * AdminsPage — v3 DEBUG + Blindaje definitivo anti React #300
 *
 * Objetivos:
 * 1) No depender de joins PostgREST (memberships <-> profiles) -> consultas separadas.
 * 2) Aislar errores de render con SafeBoundary (no tumbar toda la app).
 * 3) Instrumentación: detectar QUÉ valor (y en qué campo) intenta renderizar un objeto.
 *
 * Nota:
 * - React #300 = "Objects are not valid as a React child"
 * - Aquí forzamos que TODO lo que llegue a JSX pase por renderText(label, value)
 *   que convierte a string y además deja evidencia en consola si llega un objeto.
 */

/* =========================
   Helpers 100% seguros
   ========================= */
function safeText(v, fallback = "") {
  if (v == null) return fallback;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v);
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

/**
 * Render seguro + DEBUG:
 * - NUNCA devuelve objeto; siempre string (o fallback).
 * - Si detecta objeto/función/símbolo, loguea y guarda el snapshot en window.__ADMINS_LAST_BAD_RENDER.
 */
function renderText(label, value, fallback = "—") {
  const t = typeof value;

  // Tipos válidos directos
  if (value == null) return fallback;
  if (t === "string") return value;
  if (t === "number" || t === "boolean") return String(value);

  // ReactNode válido: array de nodos NO debe llegar aquí en strings, pero por seguridad lo convertimos
  // Funciones/Símbolos/Objetos: esto es lo que dispara #300 si se renderiza crudo.
  let preview = "";
  try {
    preview = JSON.stringify(value);
  } catch {
    preview = safeText(value, "");
  }

  // Guardar evidencia
  const snapshot = {
    label,
    typeof: t,
    preview: preview?.slice?.(0, 400) ?? safeText(preview).slice(0, 400),
    value,
  };

  try {
    window.__ADMINS_LAST_BAD_RENDER = snapshot;
  } catch {
    // ignore
  }

  // Log solo una vez por label para no inundar consola
  try {
    window.__ADMINS_BAD_LABELS = window.__ADMINS_BAD_LABELS || {};
    if (!window.__ADMINS_BAD_LABELS[label]) {
      window.__ADMINS_BAD_LABELS[label] = 1;
      // eslint-disable-next-line no-console
      console.warn("[AdminsPage] BAD RENDER VALUE ->", snapshot);
    }
  } catch {
    // ignore
  }

  // Retornar string siempre
  const out = safeText(preview, fallback);
  return out || fallback;
}

function isValidEmail(email) {
  const s = String(email || "").trim();
  return s.includes("@") && s.length >= 6;
}

/* =========================
   SafeBoundary (sí atrapa errores del hijo)
   ========================= */
class SafeBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, msg: "", info: "" };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, msg: safeText(err?.message || err, "Error de render") };
  }
  componentDidCatch(err, info) {
    const stack = safeText(info?.componentStack || "", "");
    this.setState({ info: stack });
    // eslint-disable-next-line no-console
    console.error("[AdminsPage] Render error caught by SafeBoundary:", err, info);

    // Si el error fue #300, muestra el último snapshot detectado
    try {
      if (String(err?.message || "").includes("Minified React error #300")) {
        // eslint-disable-next-line no-console
        console.error("[AdminsPage] LAST BAD RENDER SNAPSHOT:", window.__ADMINS_LAST_BAD_RENDER);
      }
    } catch {
      // ignore
    }
  }
  render() {
    if (this.state.hasError) {
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
            <div className="mt-2 break-words">{renderText("boundary.msg", this.state.msg, "Error")}</div>

            {snap ? (
              <div className="mt-3 text-[12px] bg-white/70 border border-red-200 rounded p-2">
                <div className="font-semibold mb-1">Último valor sospechoso (debug)</div>
                <div><b>label:</b> {renderText("boundary.snap.label", snap.label, "")}</div>
                <div><b>typeof:</b> {renderText("boundary.snap.typeof", snap.typeof, "")}</div>
                <div className="mt-1"><b>preview:</b></div>
                <pre className="whitespace-pre-wrap text-[11px]">{renderText("boundary.snap.preview", snap.preview, "")}</pre>
              </div>
            ) : null}

            {this.state.info ? (
              <pre className="mt-3 whitespace-pre-wrap text-[11px] text-red-700 bg-white/60 border border-red-200 rounded p-2">
                {renderText("boundary.componentStack", this.state.info, "")}
              </pre>
            ) : null}

            <div className="mt-3 text-[11px] text-red-700">
              Abre consola y busca: <span className="font-mono">[AdminsPage] BAD RENDER VALUE</span>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* =========================
   Edge invite_admin (sin libs externas)
   ========================= */
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

  const status = renderText("edge.status", resp.status, "0");
  const data = resp.data;

  if (data && typeof data === "object" && data.ok === false) {
    const step = renderText("edge.step", data.step, "edge");
    const msg = renderText("edge.message", data.message, fallback);
    return `HTTP ${status} [${step}] ${msg}`;
  }

  return `HTTP ${status} ${fallback}`;
}

/* =========================
   Loader de admins (SIN join)
   - memberships: org_id, user_id, role
   - profiles: id, email (consulta separada)
   ========================= */
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
    for (const p of r2.data || []) {
      emailById.set(p.id, p.email);
    }
  }

  return memberships.map((m) => ({
    user_id: m.user_id,
    role: m.role,
    email: emailById.get(m.user_id) || "",
    created_at: m.created_at,
  }));
}

/* =========================
   Componente interno (para que SafeBoundary lo capture)
   ========================= */
function AdminsPageInner() {
  const { authReady, orgsReady, currentOrg, user, isRootOwner } = useAuth();

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);

  const [error, setError] = useState(""); // SIEMPRE string
  const [success, setSuccess] = useState(""); // SIEMPRE string

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("admin"); // admin | owner

  const [invitedVia, setInvitedVia] = useState("");
  const [actionLink, setActionLink] = useState("");
  const [lastInvitedEmail, setLastInvitedEmail] = useState("");

  const [inviteDebug, setInviteDebug] = useState({ status: "", data: "", raw: "" });

  const orgName = useMemo(() => renderText("org.name", currentOrg?.name, "—"), [currentOrg?.name]);
  const orgId = useMemo(() => renderText("org.id", currentOrg?.id, ""), [currentOrg?.id]);
  const userEmail = useMemo(() => renderText("user.email", user?.email, "—"), [user?.email]);

  const showError = Boolean(error);
  const showSuccess = Boolean(success);
  const showInviteResult = Boolean(invitedVia || actionLink);

  // Guards
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
          No se encontró la organización actual.
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
      // e puede ser PostgrestError (objeto). SIEMPRE lo convertimos a string antes de render.
      // También guardamos snapshot por si intenta colarse en JSX.
      renderText("fetchAdmins.errorObject", e, "");
      setError(renderText("fetchAdmins.errorMessage", e?.message ?? e, "No se pudo cargar la lista de administradores."));
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
        status: renderText("inviteDebug.status", resp.status, ""),
        data: renderText("inviteDebug.data", resp.data, ""),
        raw: renderText("inviteDebug.raw", resp.raw, ""),
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

      const via = renderText("invite.via", data?.invited_via, data?.action_link ? "action_link" : "");
      const link = renderText("invite.link", data?.action_link, "");

      setLastInvitedEmail(email);
      setInvitedVia(via);
      setActionLink(link);

      if (via === "email") setSuccess(`Invitación enviada por correo a ${email}.`);
      else if (via === "action_link") setSuccess(`Copia el Magic Link y envíalo a ${email}.`);
      else setSuccess(`Invitación procesada para ${email}.`);

      setInviteEmail("");
      await fetchAdmins();
    } catch (e2) {
      renderText("invite.errorObject", e2, "");
      setError(`Error inesperado: ${renderText("invite.errorMessage", e2?.message ?? e2, "Error")}`);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleDelete = async (row) => {
    const uid = renderText("delete.user_id", row?.user_id, "");
    if (!uid) return;
    if (!window.confirm("¿Eliminar este administrador?")) return;

    setLoadingAction(true);
    setError("");
    setSuccess("");

    try {
      const { error: delErr } = await supabase
        .from("memberships")
        .delete()
        .eq("org_id", orgId)
        .eq("user_id", uid);

      if (delErr) throw delErr;

      setAdmins((prev) => (Array.isArray(prev) ? prev.filter((a) => renderText("row.user_id.compare", a?.user_id, "") !== uid) : []));
      setSuccess("Administrador eliminado.");
    } catch (e3) {
      renderText("delete.errorObject", e3, "");
      setError(renderText("delete.errorMessage", e3?.message ?? e3, "No se pudo eliminar al administrador."));
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
          Organización: <b>{orgName}</b>
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Usuario: <span className="font-mono">{userEmail}</span>
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

        {showInviteResult ? (
          <div className="mt-4 border rounded-lg p-3 bg-slate-50">
            <div className="text-xs text-slate-700">
              Invitado: <b>{renderText("invite.lastEmail", lastInvitedEmail, "—")}</b>
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
                  {renderText("invite.actionLink", actionLink, "")}
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
                <b>Status:</b> <span className="font-mono">{renderText("inviteDebug.status.render", inviteDebug.status, "")}</span>
              </div>
              <div>
                <b>Data (string):</b>
                <div className="font-mono break-all select-all mt-1">{renderText("inviteDebug.data.render", inviteDebug.data, "")}</div>
              </div>
              {inviteDebug.raw ? (
                <div>
                  <b>Raw:</b>
                  <div className="font-mono break-all select-all mt-1">{renderText("inviteDebug.raw.render", inviteDebug.raw, "")}</div>
                </div>
              ) : null}
            </div>
          </details>
        ) : null}
      </section>

      {showError ? (
        <div className="bg-red-50 border border-red-300 text-red-700 p-2 rounded text-xs mb-3">
          {renderText("ui.error", error, "")}
        </div>
      ) : null}

      {showSuccess ? (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-700 p-2 rounded text-xs mb-3">
          {renderText("ui.success", success, "")}
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
                const key = renderText("row.key.user_id", adm?.user_id, `adm-${idx}`);
                return (
                  <tr key={key} className="border-t">
                    <td className="px-3 py-2">{renderText("row.role", adm?.role, "—")}</td>
                    <td className="px-3 py-2">{renderText("row.email", adm?.email, "—")}</td>
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

      <div className="mt-4 text-[11px] text-slate-500">
        Debug rápido: en consola puedes inspeccionar{" "}
        <span className="font-mono">window.__ADMINS_LAST_BAD_RENDER</span>
      </div>
    </div>
  );
}

/* =========================
   Export default (boundary wrapper)
   ========================= */
export default function AdminsPage() {
  return (
    <SafeBoundary>
      <AdminsPageInner />
    </SafeBoundary>
  );
}
