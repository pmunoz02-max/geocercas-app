// src/pages/Personal.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { listPersonal, upsertPersonal, toggleVigente, deletePersonal } from "../lib/personalApi.js";

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function Personal() {
  const { loading, ready, isLoggedIn, currentOrg, currentRole } = useAuth();

  const role = String(currentRole || "").toLowerCase();
  const canEdit = role === "owner" || role === "admin";

  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [items, setItems] = useState([]);

  const [openNew, setOpenNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    apellido: "",
    email: "",
    telefono: "",
    vigente: true,
  });

  async function load() {
    if (!isLoggedIn) return;
    if (!currentOrg?.id) return;

    setBusy(true);
    setMsg("");

    try {
      const rows = await listPersonal({
        q,
        onlyActive,
        orgId: currentOrg.id, // compat (backend usa ctx.org_id)
        limit: 500,
      });
      setItems(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setItems([]);
      setMsg(e?.message || "No se pudo cargar personal.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!loading && ready && isLoggedIn && currentOrg?.id) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, ready, isLoggedIn, currentOrg?.id]);

  const filtered = useMemo(() => {
    if (!q) return items;
    const ql = q.toLowerCase();
    return items.filter((r) =>
      `${r?.nombre ?? ""} ${r?.apellido ?? ""} ${r?.email ?? ""} ${r?.telefono ?? ""}`
        .toLowerCase()
        .includes(ql)
    );
  }, [items, q]);

  async function onSaveNew(e) {
    e.preventDefault();
    if (!canEdit) return setMsg("No tienes permisos (solo admin/owner).");

    setSaving(true);
    setMsg("");

    try {
      await upsertPersonal(
        {
          nombre: form.nombre,
          apellido: form.apellido,
          email: form.email,
          telefono: form.telefono,
          vigente: !!form.vigente,
        },
        currentOrg.id
      );

      setOpenNew(false);
      setForm({ nombre: "", apellido: "", email: "", telefono: "", vigente: true });
      await load();
    } catch (e2) {
      setMsg(e2?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function onToggle(row) {
    if (!canEdit) return setMsg("No tienes permisos (solo admin/owner).");
    try {
      setBusy(true);
      await toggleVigente(row.id);
      await load();
    } catch (e) {
      setMsg(e?.message || "No se pudo cambiar vigencia.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(row) {
    if (!canEdit) return setMsg("No tienes permisos (solo admin/owner).");
    if (!window.confirm("¿Eliminar este registro?")) return;

    try {
      setBusy(true);
      await deletePersonal(row.id);
      await load();
    } catch (e) {
      setMsg(e?.message || "No se pudo eliminar.");
    } finally {
      setBusy(false);
    }
  }

  // Estados correctos (cliente puro)
  if (loading || !ready) return <div className="p-6 text-gray-500">Cargando sesión…</div>;

  if (!isLoggedIn) {
    return (
      <div className="p-6 text-red-600">No hay sesión activa. Inicia sesión para continuar.</div>
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
            Rol: <span className="font-semibold">{role.toUpperCase()}</span> · Org:{" "}
            <span className="font-mono">{currentOrg.id}</span>
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

      <div className="mt-4 flex flex-col md:flex-row gap-3 md:items-center">
        <input
          className="w-full md:w-96 rounded-xl border border-gray-300 px-3 py-2"
          placeholder="Buscar por nombre, apellido, email o teléfono…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
          Solo vigentes
        </label>

        <button
          className="rounded-xl border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
          onClick={load}
          disabled={busy}
        >
          {busy ? "Cargando…" : "Recargar"}
        </button>
      </div>

      {msg ? <div className="mt-4 text-sm text-red-600">{msg}</div> : null}

      <div className="mt-4 rounded-2xl border border-gray-200 bg-white overflow-hidden">
        {busy && filtered.length === 0 ? (
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
                  <td className="p-3">{r?.vigente ? "Sí" : "No"}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        className="rounded-lg border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
                        onClick={() => onToggle(r)}
                        disabled={!canEdit || busy}
                      >
                        {r?.vigente ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        className="rounded-lg border border-red-200 text-red-700 px-3 py-1 hover:bg-red-50 disabled:opacity-50"
                        onClick={() => onDelete(r)}
                        disabled={!canEdit || busy}
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
            placeholder="Teléfono (ej: +593...)"
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
