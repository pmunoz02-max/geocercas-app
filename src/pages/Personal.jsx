// src/pages/Personal.jsx
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import {
  listPersonal,
  toggleVigente,
  deletePersonal,
  upsertPersonal,
} from "../lib/personalApi.js";

/* ───────────────── Modal simple ───────────────── */
function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function PersonalPageLite() {
  const {
    loading: authLoading,
    user,
    session,
    currentRole,
    isAdmin,
    isOwner,
    // compatibilidad por si algún día agregas role al contexto
    role: legacyRole,
  } = useAuth();

  const effectiveRole = currentRole || legacyRole || "tracker";
  const canEdit = isAdmin || isOwner || effectiveRole === "owner" || effectiveRole === "admin";

  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(true); // Activos por defecto
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // Modal "Nuevo"
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    apellido: "",
    email: "",
    telefono: "",
    vigente: true,
  });
  const [saving, setSaving] = useState(false);

  async function fetchRows() {
    if (!session || !user) {
      setRows([]);
      setMsg("No hay sesión activa");
      setLoading(false);
      return;
    }
    setLoading(true);
    setMsg("");
    const { data, error } = await listPersonal({ q, onlyActive, limit: 500 });
    if (error) setMsg(error.message || "Error al cargar personal");
    setRows(Array.isArray(data) ? data.filter(Boolean) : []);
    setLoading(false);
  }

  useEffect(() => {
    if (!authLoading) fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  const filtered = useMemo(() => {
    const source = rows.slice();
    if (!q) return source;
    const ql = q.toLowerCase();
    return source.filter((r) =>
      `${r?.nombre ?? ""} ${r?.apellido ?? ""} ${r?.email ?? ""} ${r?.telefono ?? ""}`
        .toLowerCase()
        .includes(ql)
    );
  }, [rows, q]);

  async function onToggle(row) {
    if (!row?.id) return;
    if (!canEdit) {
      setMsg("No tienes permisos para cambiar vigencia (solo owner/admin).");
      return;
    }
    setLoading(true);
    const { error } = await toggleVigente(row.id, !row.vigente);
    if (error) setMsg(error.message || "No se pudo cambiar estado.");
    await fetchRows();
  }

  async function onDelete(row) {
    if (!row?.id) return;
    if (!canEdit) {
      setMsg("No tienes permisos para eliminar (solo owner/admin).");
      return;
    }
    if (!window.confirm("¿Eliminar (soft) este registro?")) return;
    setLoading(true);
    const { error } = await deletePersonal(row.id);
    if (error) setMsg(error.message || "No se pudo eliminar.");
    await fetchRows();
  }

  // Guardar NUEVO
  async function onSaveNew(e) {
    e?.preventDefault?.();
    if (!canEdit) {
      setMsg("No tienes permisos para crear (solo owner/admin).");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      // Validación mínima
      if (!form.nombre.trim()) throw new Error("Nombre es requerido.");
      if (!form.email.trim()) throw new Error("Email es requerido.");

      const { error } = await upsertPersonal({
        nombre: form.nombre,
        apellido: form.apellido,
        email: form.email,
        telefono: form.telefono,
        vigente: !!form.vigente,
      });
      if (error) throw error;

      setOpenNew(false);
      setForm({ nombre: "", apellido: "", email: "", telefono: "", vigente: true });
      await fetchRows();
    } catch (err) {
      setMsg(err?.message || "No se pudo guardar el personal.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return <div className="p-6 text-gray-500">Cargando sesión…</div>;
  if (!session || !user)
    return (
      <div className="p-6 text-red-600">
        No hay sesión activa. Inicia sesión para continuar.
      </div>
    );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Personal</h1>
          <p className="text-sm text-gray-500">
            Gestione el personal por organización: activar/desactivar, editar y eliminar.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Rol actual: <span className="font-semibold">{effectiveRole}</span>{" "}
            {canEdit ? "(con permisos de edición)" : "(solo lectura)"}
          </p>
        </div>
        <button
          className="px-3 py-2 rounded-md bg-black text-white text-sm"
          onClick={() => setOpenNew(true)}
          disabled={!canEdit}
        >
          Nuevo
        </button>
      </header>

      {/* Filtros */}
      <div className="mt-3 mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          className="border rounded-md px-3 py-2 text-sm w-72"
          placeholder="Buscar nombre, apellido o email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => setOnlyActive(e.target.checked)}
          />
          Mostrar solo activos
        </label>
        <button
          className="px-3 py-2 rounded-md bg-gray-900 text-white text-sm"
          onClick={fetchRows}
          disabled={loading}
        >
          {loading ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {msg && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2">
          {msg}
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-gray-600">
              <th className="px-3">Nombre</th>
              <th className="px-3">Email</th>
              <th className="px-3">Teléfono</th>
              <th className="px-3">Activo</th>
              <th className="px-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={5}>
                  Cargando…
                </td>
              </tr>
            ) : filtered.length ? (
              filtered.map((r, idx) => (
                <tr key={r?.id ?? `row-${idx}`} className="bg-white rounded-md shadow-sm">
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {(r?.nombre || "").trim()} {(r?.apellido || "").trim()}
                    </div>
                  </td>
                  <td className="px-3 py-2">{r?.email || "—"}</td>
                  <td className="px-3 py-2">{r?.telefono || "—"}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-gray-100">
                      {r?.vigente ? "sí" : "no"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        className="px-2 py-1 rounded-md bg-sky-600 text-white"
                        onClick={() => alert("TODO: Editar")}
                        disabled={!canEdit}
                      >
                        Editar
                      </button>
                      <button
                        className="px-2 py-1 rounded-md bg-indigo-600 text-white"
                        onClick={() => onToggle(r)}
                        disabled={!canEdit}
                      >
                        {r?.vigente ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        className="px-2 py-1 rounded-md bg-rose-600 text-white"
                        onClick={() => onDelete(r)}
                        disabled={!canEdit}
                      >
                        Eliminar (soft)
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={5}>
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal NUEVO */}
      <Modal open={openNew} title="Nuevo personal" onClose={() => setOpenNew(false)}>
        <form onSubmit={onSaveNew} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Nombre *</label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={form.nombre}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    nombre: e.target.value,
                  }))
                }
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Apellido</label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={form.apellido}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    apellido: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Email *</label>
              <input
                type="email"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    email: e.target.value,
                  }))
                }
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Teléfono</label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={form.telefono}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    telefono: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.vigente}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  vigente: e.target.checked,
                }))
              }
            />
            Activo
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="px-3 py-2 rounded-md bg-gray-200 text-gray-800 text-sm"
              onClick={() => setOpenNew(false)}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-3 py-2 rounded-md bg-black text-white text-sm"
              disabled={saving || !canEdit}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
