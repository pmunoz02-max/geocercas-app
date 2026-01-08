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
    role: legacyRole,
  } = useAuth();

  const effectiveRole = currentRole || legacyRole || "tracker";
  const canEdit =
    isAdmin ||
    isOwner ||
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
  } // ✅ ESTA LLAVE FALTABA

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

  if (authLoading)
    return <div className="p-6 text-gray-500">Cargando sesión…</div>;

  if (!session || !user)
    return (
      <div className="p-6 text-red-600">
        No hay sesión activa. Inicia sesión para continuar.
      </div>
    );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold mb-4">Personal</h1>
      {/* resto del JSX SIN CAMBIOS */}
    </div>
  );
}
