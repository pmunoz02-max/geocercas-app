// src/pages/admin/UsersRoles.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient.js";
function Notice({ type = "info", children }) {
  const colors =
    {
      info: "bg-blue-50 border-blue-200 text-blue-800",
      success: "bg-green-50 border-green-200 text-green-800",
      warn: "bg-yellow-50 border-yellow-200 text-yellow-800",
      error: "bg-red-50 border-red-200 text-red-800",
    }[type] || "bg-blue-50 border-blue-200 text-blue-800";
  return <div className={`border rounded p-2 text-sm ${colors}`}>{children}</div>;
}

async function extractEdgeError(error) {
  if (!error) return null;

  const ctx = error?.context;
  const resp = ctx?.response;

  if (resp && typeof resp.json === "function") {
    try {
      const payload = await resp.json();
      return {
        message: error.message,
        stage: payload?.ctx?.stage ?? payload?.stage ?? null,
        detail: payload?.ctx?.detail ?? payload?.detail ?? payload?.error ?? null,
        hint: payload?.ctx?.hint ?? payload?.hint ?? null,
        raw: payload,
      };
    } catch (_) {
      try {
        const text = await resp.text();
        return { message: error.message, stage: null, detail: text, hint: null, raw: null };
      } catch (_) {
        return { message: error.message, stage: null, detail: null, hint: null, raw: null };
      }
    }
  }

  return {
    message: error?.message || String(error),
    stage: null,
    detail: null,
    hint: null,
    raw: null,
  };
}

function formatEdgeError(info) {
  if (!info) return "Error desconocido";
  const parts = [];
  if (info.stage) parts.push(`stage: ${info.stage}`);
  if (info.detail) parts.push(`detail: ${info.detail}`);
  if (info.hint) parts.push(`hint: ${info.hint}`);
  if (parts.length === 0) return info.message || "Error desconocido";
  return `${info.message || "Error"} (${parts.join(" · ")})`;
}

export default function UsersRoles() {
  const [roles, setRoles] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    full_name: "",
    role_name: "tracker",
  });
  const [roleDraft, setRoleDraft] = useState({});

  useEffect(() => {
    refreshAll();
  }, []);

  async function refreshAll() {
    setLoading(true);
    setMsg(null);
    try {
      const { data: r1, error: e1 } = await supabase.from("roles").select("id,name").order("name");
      if (e1) throw e1;
      setRoles(r1 || []);

      const { data: r2, error: e2 } = await supabase
        .from("pending_invites")
        .select("email, role_id, created_at")
        .order("created_at", { ascending: false });
      if (e2) throw e2;
      setPending(r2 || []);

      const { data: r3, error: e3 } = await supabase
        .from("profiles")
        .select("id, email, full_name, role_id, created_at")
        .order("created_at", { ascending: false });
      if (e3) throw e3;
      setProfiles(r3 || []);
    } catch (err) {
      console.error(err);
      setMsg({ type: "error", text: err?.message || String(err) });
    } finally {
      setLoading(false);
    }
  }

  const rolesById = useMemo(() => {
    const m = new Map();
    roles.forEach((r) => m.set(r.id, r.name));
    return m;
  }, [roles]);

  function setMessage(type, text, ttl = 4000) {
    setMsg({ type, text });
    if (ttl) setTimeout(() => setMsg(null), ttl);
  }

  function onInviteChange(e) {
    const { name, value } = e.target;
    setInviteForm((f) => ({ ...f, [name]: value }));
  }

  async function handleInvite(e) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const { email, full_name, role_name } = inviteForm;

      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email, full_name, role_name },
      });

      if (error) {
        const info = await extractEdgeError(error);
        console.error("[UsersRoles] invite-user ERROR:", { error, info });
        throw new Error(formatEdgeError(info));
      }

      if (data?.ok) {
        setMessage("success", `Invitación enviada a ${email}`);
        setInviteForm({ email: "", full_name: "", role_name: "tracker" });
        await refreshAll();
      } else {
        const stage = data?.ctx?.stage || data?.stage || null;
        const detail = data?.ctx?.detail || data?.detail || data?.error || null;
        const hint = data?.ctx?.hint || data?.hint || null;
        const parts = [];
        if (stage) parts.push(`stage: ${stage}`);
        if (detail) parts.push(`detail: ${detail}`);
        if (hint) parts.push(`hint: ${hint}`);
        throw new Error(parts.length ? `Error invitando usuario (${parts.join(" · ")})` : (detail || "Error invitando usuario"));
      }
    } catch (err) {
      console.error(err);
      setMessage("error", err?.message || String(err), 8000);
    } finally {
      setLoading(false);
    }
  }

  // Solo MAGIC LINK
  async function handleMagicLink(email, full_name) {
    setLoading(true);
    setMsg(null);
    try {
      const redirectTo = `${window.location.origin}/tracker/callback`;
      const { data, error } = await supabase.functions.invoke("send-magic-link", {
        body: { email, full_name, redirectTo, inviteIfNotExists: true },
      });

      if (error) {
        const info = await extractEdgeError(error);
        console.error("[UsersRoles] send-magic-link ERROR:", { error, info });
        throw new Error(formatEdgeError(info));
      }

      if (data?.ok) {
        setMessage(
          "success",
          data.mode === "INVITE_SENT" ? `Invitación enviada a ${email}` : `Magic link enviado a ${email}`
        );
      } else {
        throw new Error(data?.error || "Error enviando Magic Link");
      }
    } catch (e) {
      const m = e?.message || String(e);
      const hint = /FunctionsFetchError/i.test(m)
        ? " Verifica que send-magic-link esté desplegada con --no-verify-jwt y responda OPTIONS con CORS."
        : "";
      setMessage("error", m + hint, 8000);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignRole(email, full_name, role_name) {
    setLoading(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-set-role", {
        body: { email, full_name, role_name },
      });

      if (error) {
        const info = await extractEdgeError(error);
        console.error("[UsersRoles] admin-set-role ERROR:", { error, info });
        throw new Error(formatEdgeError(info));
      }

      if (data?.ok) {
        setMessage("success", `Rol "${role_name}" asignado a ${email}`);
        await refreshAll();
      } else {
        throw new Error(data?.error || "Error asignando rol");
      }
    } catch (err) {
      console.error(err);
      setMessage("error", err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteOrSuspend(email) {
    if (!window.confirm(`¿Eliminar/suspender a ${email}?`)) return;
    setLoading(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: { email },
      });

      if (error) {
        const info = await extractEdgeError(error);
        console.error("[UsersRoles] admin-delete-user ERROR:", { error, info });
        throw new Error(formatEdgeError(info));
      }

      if (data?.ok) {
        setMessage("success", `Usuario ${email} eliminado/suspendido`);
        await refreshAll();
      } else {
        throw new Error(data?.error || "Error eliminando/suspendiendo usuario");
      }
    } catch (err) {
      console.error(err);
      setMessage("error", err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Usuarios y Roles</h1>
        {loading && <span className="text-sm text-gray-500">Procesando…</span>}
      </header>

      {msg && <Notice type={msg.type}>{msg.text}</Notice>}

      {/* INVITAR */}
      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-medium">Invitar usuario</h2>
        <form className="grid sm:grid-cols-4 gap-3" onSubmit={handleInvite}>
          <input
            type="email"
            name="email"
            required
            value={inviteForm.email}
            onChange={onInviteChange}
            placeholder="correo@dominio.com"
            className="border rounded p-2"
          />
          <input
            type="text"
            name="full_name"
            value={inviteForm.full_name}
            onChange={onInviteChange}
            placeholder="Nombre completo"
            className="border rounded p-2"
          />
          <select
            name="role_name"
            value={inviteForm.role_name}
            onChange={onInviteChange}
            className="border rounded p-2"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading}
            className="bg-black text-white rounded p-2 hover:bg-gray-800 disabled:opacity-50"
          >
            Invitar
          </button>
        </form>
      </section>

      {/* INVITACIONES PENDIENTES */}
      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-medium">Invitaciones pendientes</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-500">No hay invitaciones.</p>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.email} className="border-b">
                    <td>{p.email}</td>
                    <td>{rolesById.get(p.role_id) || "—"}</td>
                    <td>{new Date(p.created_at).toLocaleString()}</td>
                    <td className="space-x-2">
                      <button
                        onClick={() => handleMagicLink(p.email, null)}
                        className="px-2 py-1 border rounded hover:bg-gray-50"
                        disabled={loading}
                      >
                        Magic Link
                      </button>
                      <button
                        onClick={() => handleDeleteOrSuspend(p.email)}
                        className="px-2 py-1 border rounded text-red-700 border-red-300 hover:bg-red-50"
                        disabled={loading}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* USUARIOS */}
      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-medium">Usuarios</h2>
        {profiles.length === 0 ? (
          <p className="text-sm text-gray-500">No hay usuarios registrados.</p>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th>Email</th>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Nuevo Rol</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((u) => (
                  <tr key={u.id} className="border-b">
                    <td>{u.email}</td>
                    <td>{u.full_name || "—"}</td>
                    <td>{rolesById.get(u.role_id) || "—"}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <select
                          value={roleDraft[u.id] ?? rolesById.get(u.role_id) ?? "tracker"}
                          onChange={(e) =>
                            setRoleDraft((d) => ({ ...d, [u.id]: e.target.value }))
                          }
                          className="border rounded p-1"
                        >
                          {roles.map((r) => (
                            <option key={r.id} value={r.name}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() =>
                            handleAssignRole(
                              u.email,
                              u.full_name,
                              roleDraft[u.id] ?? rolesById.get(u.role_id) ?? "tracker"
                            )
                          }
                          className="px-2 py-1 border rounded hover:bg-gray-50"
                          disabled={loading}
                        >
                          Asignar
                        </button>
                      </div>
                    </td>
                    <td className="space-x-2">
                      <button
                        onClick={() => handleMagicLink(u.email, u.full_name)}
                        className="px-2 py-1 border rounded hover:bg-gray-50"
                        disabled={loading}
                      >
                        Magic Link
                      </button>
                      <button
                        onClick={() => handleDeleteOrSuspend(u.email)}
                        className="px-2 py-1 border rounded text-red-700 border-red-300 hover:bg-red-50"
                        disabled={loading}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
