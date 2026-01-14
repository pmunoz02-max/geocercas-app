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
    ready,
    user,
    isLoggedIn,
    currentRole,
    role: legacyRole,
    isAdmin,
    isOwner,
    currentOrg,
  } = useAuth();

  const effectiveRole = (currentRole || legacyRole || "tracker").toLowerCase();
  const canEdit =
    Boolean(isAdmin) ||
    Boolean(isOwner) ||
    effectiveRole === "owner" ||
    effectiveRole === "admin";

  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

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
    // ✅ Nueva arquitectura: NO usar session
    if (!isLoggedIn || !user) {
      setRows([]);
      setMsg("No hay sesión activa");
      setLoading(false);
      return;
    }
    if (!currentOrg?.id) {
      setRows([]);
      setMsg("No hay organización activa");
      setLoading(false);
      return;
    }

    setLoading(true);
    setMsg("");

    // Si tu listPersonal filtra por org internamente, perfecto.
    // Si NO, lo corregimos en personalApi.js (siguiente paso).
    const { data, error } = await listPersonal({ q, onlyActive, limit: 500 });

    if (error) setMsg(error.message || "Error al cargar personal");
    setRows(Array.isArray(data) ? data.filter(Boolean) : []);
    setLoading(false);
  }

  useEffect(() => {
    if (!authLoading && ready) fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, ready]);

  const filtered = useMemo(() => {
    const source = rows.slice();
    if (!q) return source;
    const ql = q.toLowerCase();
    return source.filter((r) =>
      `${r?.nombre ?? ""} ${r?.apellido ?? ""} ${r?.email ?? ""} ${
        r?.telefono ?? ""
      }`
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
    try {
      const deleted = await deletePersonal(row.id);
      if (!deleted) {
        setMsg(
          "No se eliminó ningún registro (0 filas afectadas). Verifica permisos."
        );
      }
    } catch (err) {
      setMsg(err?.message || "No se pudo eliminar.");
    } finally {
      await fetchRows();
      setLoading(false);
    }
  }

  async function onSaveNew(e) {
    e?.preventDefault?.();
    if (!canEdit) {
      setMsg("No tienes permisos para crear (solo owner/admin).");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
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
      setForm({
        nombre: "",
        apellido: "",
        email: "",
        telefono: "",
        vigente: true,
      });
      await fetchRows();
    } catch (err) {
      setMsg(err?.message || "No se pudo guardar el personal.");
    } finally {
      setSaving(false);
    }
  }

  // ✅ Estados correctos (sin session)
  if (authLoading || !ready) {
    return <div className="p-6 text-gray-500">Cargando sesión…</div>;
  }

  if (!isLoggedIn || !user) {
    return (
      <div className="p-6 text-red-600">
        No hay sesión activa. Inicia sesión para continuar.
      </div>
    );
  }

  if (!currentOrg?.id) {
    return (
      <div className="p-6 text-red-600">
        No hay organización activa. Selecciona una organización para continuar.
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Personal</h1>
          <div className="text-sm text-gray-500">
            Rol: <span className="font-semibold">{effectiveRole.toUpperCase()}</span>{" "}
            · Org: <span className="font-mono">{currentOrg.id}</span>
          </div>
        </div>

        {canEdit ? (
          <button
            className="rounded-xl bg-slate-900 text-white px-4 py-2 hover:bg-slate-800"
            onClick={() => setOpenNew(true)}
          >
            + Nuevo
          </button>
        ) : null}
      </div>

      {/* Controles */}
      <div className="mt-4 flex flex-col md:flex-row gap-3 md:items-center">
        <input
          className="w-full md:w-96 rounded-xl border border-gray-300 px-3 py-2"
          placeholder="Buscar por nombre, apellido, email o teléfono…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => setOnlyActive(e.target.checked)}
          />
          Solo vigentes
        </label>

        <button
          className="rounded-xl border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
          onClick={fetchRows}
          disabled={loading}
        >
          {loading ? "Cargando…" : "Recargar"}
        </button>
      </div>

      {msg ? <div className="mt-4 text-sm text-red-600">{msg}</div> : null}

      {/* Tabla */}
      <div className="mt-4 rounded-2xl border border-gray-200 bg-white overflow-hidden">
        {loading && filtered.length === 0 ? (
          <div className="p-4 text-gray-500">Cargando personal…</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-gray-500">No hay registros.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left font-medium p-3">Nombre</th>
                <th className="text-left font-medium p-3">Apellido</th>
                <th className="text-left font-medium p-3">Email</th>
                <th className="text-left font-medium p-3">Teléfono</th>
                <th className="text-left font-medium p-3">Vigente</th>
                <th className="text-left font-medium p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="p-3">{r?.nombre ?? "-"}</td>
                  <td className="p-3">{r?.apellido ?? "-"}</td>
                  <td className="p-3">{r?.email ?? "-"}</td>
                  <td className="p-3">{r?.telefono ?? "-"}</td>
                  <td className="p-3">
                    <span
                      className={`inline-flex px-2 py-1 rounded-lg text-xs ${
                        r?.vigente ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {r?.vigente ? "Sí" : "No"}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        className="rounded-lg border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
                        onClick={() => onToggle(r)}
                        disabled={!canEdit || loading}
                      >
                        {r?.vigente ? "Desactivar" : "Activar"}
                      </button>

                      <button
                        className="rounded-lg border border-red-200 text-red-700 px-3 py-1 hover:bg-red-50 disabled:opacity-50"
                        onClick={() => onDelete(r)}
                        disabled={!canEdit || loading}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Nuevo */}
      <Modal open={openNew} title="Nuevo personal" onClose={() => setOpenNew(false)}>
        <form className="space-y-3" onSubmit={onSaveNew}>
          <input
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
            placeholder="Nombre"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          />
          <input
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
            placeholder="Apellido"
            value={form.apellido}
            onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value }))}
          />
          <input
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <input
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
            placeholder="Teléfono"
            value={form.telefono}
            onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
          />

          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={!!form.vigente}
              onChange={(e) => setForm((f) => ({ ...f, vigente: e.target.checked }))}
            />
            Vigente
          </label>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-xl border border-gray-300 px-4 py-2 hover:bg-gray-50"
              onClick={() => setOpenNew(false)}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 text-white px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
