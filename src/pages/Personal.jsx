import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient";

/**
 * src/pages/Personal.jsx — v5
 *
 * FIXES:
 * - ❌ No inserta/actualiza columna "activo" (GENERATED)
 * - Usa "vigente" como estado editable
 * - Mantiene filtro org_id
 * - ✅ Fallback de rol: si AuthContext no entrega role, lo lee de app_user_roles / memberships
 */

function cls(...a) {
  return a.filter(Boolean).join(" ");
}

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white border border-slate-200 shadow-xl">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="text-slate-900 font-semibold">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-600 hover:text-slate-900 px-2"
            aria-label="Cerrar"
            title="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function buildOrFilter(q) {
  const s = String(q || "").trim();
  if (!s) return null;

  const esc = s.replace(/%/g, "\\%").replace(/,/g, "\\,");
  const like = `%${esc}%`;

  return [
    `nombre.ilike.${like}`,
    `apellido.ilike.${like}`,
    `telefono.ilike.${like}`,
    `email.ilike.${like}`,
  ].join(",");
}

export default function Personal() {
  const { loading, isAuthenticated, user, currentOrg, role, refreshContext } =
    useAuth();

  // ✅ Rol efectivo (si AuthContext falla, lo resolvemos acá)
  const [effectiveRole, setEffectiveRole] = useState(role ?? null);
  const [roleBusy, setRoleBusy] = useState(false);

  useEffect(() => {
    setEffectiveRole(role ?? null);
  }, [role]);

  async function resolveRoleFallback() {
    if (!isAuthenticated || !user?.id || !currentOrg?.id) return;
    if (role) return; // ya hay rol en contexto
    if (roleBusy) return;

    setRoleBusy(true);
    try {
      // 1) Intentar desde app_user_roles
      const { data: aur, error: aurErr } = await supabase
        .from("app_user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("org_id", currentOrg.id)
        .limit(1)
        .maybeSingle();

      if (aurErr) throw aurErr;

      if (aur?.role) {
        setEffectiveRole(aur.role);
        // opcional: pedir re-sync del contexto
        refreshContext?.();
        return;
      }

      // 2) Fallback a memberships
      const { data: mem, error: memErr } = await supabase
        .from("memberships")
        .select("role")
        .eq("user_id", user.id)
        .eq("org_id", currentOrg.id)
        .limit(1)
        .maybeSingle();

      if (memErr) throw memErr;

      if (mem?.role) {
        setEffectiveRole(mem.role);
        refreshContext?.();
        return;
      }

      setEffectiveRole(null);
    } catch (e) {
      console.error("[Personal] resolveRoleFallback error", e);
      setEffectiveRole(null);
    } finally {
      setRoleBusy(false);
    }
  }

  useEffect(() => {
    if (!loading && isAuthenticated && user?.id && currentOrg?.id && !role) {
      resolveRoleFallback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAuthenticated, user?.id, currentOrg?.id, role]);

  const roleLower = useMemo(
    () => String(effectiveRole || "").toLowerCase(),
    [effectiveRole]
  );
  const canEdit = roleLower === "owner" || roleLower === "admin";

  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState({
    nombre: "",
    apellido: "",
    telefono: "",
    email: "",
    vigente: true,
  });

  function resetForm() {
    setForm({
      nombre: "",
      apellido: "",
      telefono: "",
      email: "",
      vigente: true,
    });
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      nombre: row.nombre || "",
      apellido: row.apellido || "",
      telefono: row.telefono || "",
      email: row.email || "",
      vigente: row.vigente !== false,
    });
  }

  function closeModal() {
    setOpenNew(false);
    setEditing(null);
    resetForm();
    setMsg("");
  }

  function validate() {
    const nombre = (form.nombre || "").trim();
    const email = (form.email || "").trim();
    if (!nombre) return "Nombre es obligatorio.";
    if (!email) return "Email es obligatorio.";
    return null;
  }

  async function load() {
    setMsg("");
    if (!isAuthenticated || !currentOrg?.id) return;

    setBusy(true);
    try {
      let qy = supabase
        .from("personal")
        .select("*")
        .eq("org_id", currentOrg.id)
        .order("created_at", { ascending: false })
        .limit(500);

      const or = buildOrFilter(q);
      if (or) qy = qy.or(or);

      const { data, error } = await qy;
      if (error) throw error;

      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("[Personal] load error", e);
      setMsg(e?.message || "No se pudo cargar el listado.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const run = async () => {
      if (!loading && isAuthenticated && currentOrg?.id) {
        await load();
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAuthenticated, currentOrg?.id]);

  async function onSave() {
    if (!canEdit) return;

    const v = validate();
    if (v) {
      setMsg(v);
      return;
    }

    setMsg("");
    setBusy(true);
    try {
      const row = {
        org_id: currentOrg.id,
        nombre: form.nombre.trim(),
        apellido: form.apellido?.trim() || null,
        telefono: form.telefono?.trim() || null,
        email: form.email.trim(),
        vigente: !!form.vigente,
        // ✅ NO enviar "activo" (GENERATED)
      };

      if (editing?.id) {
        const { error } = await supabase
          .from("personal")
          .update(row)
          .eq("id", editing.id)
          .eq("org_id", currentOrg.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("personal").insert([row]);
        if (error) throw error;
      }

      closeModal();
      await load();
    } catch (e) {
      console.error("[Personal] save error", e);
      setMsg(e?.message || "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleVigente(row) {
    if (!canEdit) return;
    setMsg("");
    setBusy(true);
    try {
      const next = !(row.vigente !== false);
      const { error } = await supabase
        .from("personal")
        .update({ vigente: next })
        .eq("id", row.id)
        .eq("org_id", currentOrg.id);
      if (error) throw error;

      await load();
    } catch (e) {
      console.error("[Personal] toggle vigente error", e);
      setMsg(e?.message || "No se pudo cambiar el estado.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(row) {
    if (!canEdit) return;
    const ok = window.confirm("¿Eliminar este registro?");
    if (!ok) return;

    setMsg("");
    setBusy(true);
    try {
      if ("is_deleted" in row) {
        const { error } = await supabase
          .from("personal")
          .update({ is_deleted: true, vigente: false })
          .eq("id", row.id)
          .eq("org_id", currentOrg.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("personal")
          .delete()
          .eq("id", row.id)
          .eq("org_id", currentOrg.id);
        if (error) throw error;
      }

      await load();
    } catch (e) {
      console.error("[Personal] delete error", e);
      setMsg(e?.message || "No se pudo eliminar.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-6 text-slate-600">Cargando sesión…</div>;

  if (!isAuthenticated || !user) {
    return (
      <div className="p-6 text-red-700 bg-red-50 border border-red-200 rounded-xl">
        Debes iniciar sesión.
      </div>
    );
  }

  if (!currentOrg?.id) {
    return (
      <div className="p-6 text-red-700 bg-red-50 border border-red-200 rounded-xl">
        No hay organización activa.
        <div className="mt-3">
          <button
            type="button"
            onClick={() => refreshContext?.()}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition"
          >
            Reintentar contexto
          </button>
        </div>
      </div>
    );
  }

  const roleLabelUi =
    roleBusy && !effectiveRole ? "CARGANDO…" : (roleLower || "sin rol").toUpperCase();

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-1 text-slate-900">Personal</h1>
          <div className="text-sm text-slate-700">
            Rol: <span className="font-semibold text-slate-900">{roleLabelUi}</span>{" "}
            · Org: <span className="font-mono text-slate-700">{currentOrg.id}</span>
          </div>
        </div>

        {canEdit && (
          <button
            className="rounded-xl bg-slate-900 text-white px-4 py-2 hover:bg-slate-800 transition"
            onClick={() => setOpenNew(true)}
            type="button"
          >
            + Nuevo
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-col md:flex-row gap-3 md:items-center">
        <input
          className="w-full md:w-[520px] rounded-xl bg-white border border-slate-300 px-4 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
          placeholder="Buscar por nombre, apellido, email o teléfono…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-xl bg-slate-900 text-white px-4 py-2 hover:bg-slate-800 transition disabled:opacity-60"
            onClick={() => load()}
            disabled={busy}
          >
            {busy ? "Cargando…" : "Actualizar"}
          </button>

          <button
            type="button"
            className="rounded-xl bg-white border border-slate-300 text-slate-700 px-4 py-2 hover:bg-slate-50 transition disabled:opacity-60"
            onClick={() => {
              setQ("");
              setTimeout(() => load(), 0);
            }}
            disabled={busy}
          >
            Limpiar
          </button>
        </div>
      </div>

      {msg && (
        <div className="mt-4 rounded-xl border border-red-600 bg-red-50 text-red-800 px-4 py-3 text-sm font-medium">
          ⚠️ {msg}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-slate-200 overflow-hidden bg-white">
        <table className="w-full text-sm text-slate-800">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                Nombre
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                Teléfono
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                Email
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                Estado
              </th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700">
                Acciones
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const deleted = !!r.is_deleted;
              const vigente = r.vigente !== false && !deleted;
              return (
                <tr
                  key={r.id}
                  className="border-t border-slate-200 hover:bg-slate-50 transition"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {r.nombre || ""} {r.apellido || ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">{r.telefono || ""}</td>
                  <td className="px-4 py-3">{r.email || ""}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cls(
                        "px-2 py-1 rounded-full text-xs border font-medium",
                        vigente
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : "bg-slate-100 border-slate-200 text-slate-700"
                      )}
                    >
                      {vigente ? "Vigente" : deleted ? "Eliminado" : "No vigente"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition disabled:opacity-60"
                        onClick={() => openEdit(r)}
                        disabled={!canEdit || busy}
                        title="Editar"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition disabled:opacity-60"
                        onClick={() => onToggleVigente(r)}
                        disabled={!canEdit || busy || deleted}
                        title="Vigente / No vigente"
                      >
                        ⏻
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-60"
                        onClick={() => onDelete(r)}
                        disabled={!canEdit || busy}
                        title="Eliminar"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {!busy && rows.length === 0 && (
              <tr className="border-t border-slate-200">
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-slate-600 font-medium bg-slate-50"
                >
                  No hay registros en esta organización.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={openNew || !!editing}
        title={editing ? "Editar personal" : "Nuevo personal"}
        onClose={closeModal}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-700">Nombre *</label>
            <input
              className="mt-1 w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-slate-400"
              value={form.nombre}
              onChange={(e) => setForm((s) => ({ ...s, nombre: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs text-slate-700">Apellido</label>
            <input
              className="mt-1 w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-slate-400"
              value={form.apellido}
              onChange={(e) => setForm((s) => ({ ...s, apellido: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs text-slate-700">Teléfono</label>
            <input
              className="mt-1 w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-slate-400"
              value={form.telefono}
              onChange={(e) => setForm((s) => ({ ...s, telefono: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs text-slate-700">Email *</label>
            <input
              className="mt-1 w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-slate-400"
              value={form.email}
              onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
            />
          </div>

          <div className="md:col-span-2 flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              checked={!!form.vigente}
              onChange={(e) =>
                setForm((s) => ({ ...s, vigente: e.target.checked }))
              }
            />
            <span className="text-slate-800">Vigente</span>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition disabled:opacity-60"
            onClick={closeModal}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-60"
            onClick={onSave}
            disabled={busy || !canEdit}
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
