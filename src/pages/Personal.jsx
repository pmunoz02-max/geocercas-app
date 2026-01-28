import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient";

/**
 * src/pages/Personal.jsx (RLS-first, sin /api)
 * - Lee/escribe directo a Supabase con RLS (multi-tenant por org_id)
 * - Evita el error 500 "Failed to refresh token" de /api/personal (cookies)
 * - ✅ AuthContext NUEVO: loading, isAuthenticated, user, currentOrg, role, refreshContext
 * - ✅ UI: contraste alto (mensajes y botones legibles)
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
  // escape % and , minimally
  const esc = s.replace(/%/g, "\\%").replace(/,/g, "\\,");
  const like = `%${esc}%`;

  // Ajusta campos si tu tabla usa otros nombres.
  // Se usa OR para nombre/apellido/cedula/telefono/email.
  return [
    `nombre.ilike.${like}`,
    `apellido.ilike.${like}`,
    `cedula.ilike.${like}`,
    `telefono.ilike.${like}`,
    `email.ilike.${like}`,
  ].join(",");
}

export default function Personal() {
  const { t } = useTranslation();

  // ✅ AuthContext NUEVO
  const { loading, isAuthenticated, user, currentOrg, role, refreshContext } = useAuth();

  const roleLower = useMemo(() => String(role || "").toLowerCase(), [role]);
  const canEdit = roleLower === "owner" || roleLower === "admin";

  // UI state
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // Modal Nuevo / Editar
  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState({
    nombre: "",
    apellido: "",
    cedula: "",
    telefono: "",
    email: "",
    activo: true,
  });

  function resetForm() {
    setForm({
      nombre: "",
      apellido: "",
      cedula: "",
      telefono: "",
      email: "",
      activo: true,
    });
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      nombre: row.nombre || "",
      apellido: row.apellido || "",
      cedula: row.cedula || "",
      telefono: row.telefono || "",
      email: row.email || "",
      activo: row.activo !== false,
    });
  }

  function closeModal() {
    setOpenNew(false);
    setEditing(null);
    resetForm();
    setMsg("");
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
      setMsg(e?.message || t("personal.errorLoad", { defaultValue: "No se pudo cargar el listado." }));
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

    setMsg("");
    setBusy(true);
    try {
      const row = {
        org_id: currentOrg.id,
        nombre: form.nombre?.trim() || null,
        apellido: form.apellido?.trim() || null,
        cedula: form.cedula?.trim() || null,
        telefono: form.telefono?.trim() || null,
        email: form.email?.trim() || null,
        activo: !!form.activo,
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
      setMsg(e?.message || t("personal.errorSave", { defaultValue: "No se pudo guardar." }));
    } finally {
      setBusy(false);
    }
  }

  async function onToggleActive(row) {
    if (!canEdit) return;
    setMsg("");
    setBusy(true);
    try {
      const next = !(row.activo !== false);
      const { error } = await supabase
        .from("personal")
        .update({ activo: next })
        .eq("id", row.id)
        .eq("org_id", currentOrg.id);
      if (error) throw error;

      await load();
    } catch (e) {
      console.error("[Personal] toggle error", e);
      setMsg(e?.message || t("personal.errorToggle", { defaultValue: "No se pudo cambiar el estado." }));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(row) {
    if (!canEdit) return;
    const ok = window.confirm(t("personal.confirmDelete", { defaultValue: "¿Eliminar este registro?" }));
    if (!ok) return;

    setMsg("");
    setBusy(true);
    try {
      const { error } = await supabase
        .from("personal")
        .delete()
        .eq("id", row.id)
        .eq("org_id", currentOrg.id);
      if (error) throw error;

      await load();
    } catch (e) {
      console.error("[Personal] delete error", e);
      setMsg(e?.message || t("personal.errorDelete", { defaultValue: "No se pudo eliminar." }));
    } finally {
      setBusy(false);
    }
  }

  // ✅ Guardas NUEVOS
  if (loading) {
    return (
      <div className="p-6 text-slate-600">
        {t("personal.bannerLoadingSession", { defaultValue: "Cargando sesión…" })}
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="p-6 text-red-700 bg-red-50 border border-red-200 rounded-xl">
        {t("personal.bannerLoginRequired", { defaultValue: "Debes iniciar sesión." })}
      </div>
    );
  }

  if (!currentOrg?.id) {
    return (
      <div className="p-6 text-red-700 bg-red-50 border border-red-200 rounded-xl">
        {t("personal.errorMissingTenant", { defaultValue: "No hay organización activa." })}
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

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-1 text-slate-900">
            {t("personal.title", { defaultValue: "Personal" })}
          </h1>
          <div className="text-sm text-slate-700">
            {t("personal.roleLabel", { defaultValue: "Rol:" })}{" "}
            <span className="font-semibold text-slate-900">
              {(roleLower || "sin rol").toUpperCase()}
            </span>{" "}
            · Org: <span className="font-mono text-slate-700">{currentOrg.id}</span>
          </div>
        </div>

        {canEdit && (
          <button
            className="rounded-xl bg-slate-900 text-white px-4 py-2 hover:bg-slate-800 transition"
            onClick={() => setOpenNew(true)}
            type="button"
          >
            + {t("personal.buttonNew", { defaultValue: "Nuevo" })}
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-col md:flex-row gap-3 md:items-center">
        <input
          className="w-full md:w-[520px] rounded-xl bg-white border border-slate-300 px-4 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
          placeholder={t("personal.searchPlaceholder", { defaultValue: "Buscar por nombre, apellido, email o teléfono…" })}
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
            {busy
              ? t("personal.loading", { defaultValue: "Cargando…" })
              : t("personal.refresh", { defaultValue: "Actualizar" })}
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
            {t("personal.clear", { defaultValue: "Limpiar" })}
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
                {t("personal.colNombre", { defaultValue: "Nombre" })}
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                {t("personal.colCedula", { defaultValue: "Cédula" })}
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                {t("personal.colTelefono", { defaultValue: "Teléfono" })}
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                {t("personal.colEmail", { defaultValue: "Email" })}
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                {t("personal.colEstado", { defaultValue: "Estado" })}
              </th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700">
                {t("personal.colAcciones", { defaultValue: "Acciones" })}
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-200 hover:bg-slate-50 transition">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">
                    {r.nombre || ""} {r.apellido || ""}
                  </div>
                </td>
                <td className="px-4 py-3">{r.cedula || ""}</td>
                <td className="px-4 py-3">{r.telefono || ""}</td>
                <td className="px-4 py-3">{r.email || ""}</td>
                <td className="px-4 py-3">
                  <span
                    className={cls(
                      "px-2 py-1 rounded-full text-xs border font-medium",
                      r.activo !== false
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-slate-100 border-slate-200 text-slate-700"
                    )}
                  >
                    {r.activo !== false
                      ? t("personal.active", { defaultValue: "Activo" })
                      : t("personal.inactive", { defaultValue: "Inactivo" })}
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
                      onClick={() => onToggleActive(r)}
                      disabled={!canEdit || busy}
                      title="Activar/Desactivar"
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
            ))}

            {!busy && rows.length === 0 && (
              <tr className="border-t border-slate-200">
                <td colSpan={6} className="px-4 py-8 text-center text-slate-600 font-medium bg-slate-50">
                  {t("personal.empty", { defaultValue: "No hay registros en esta organización." })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={openNew || !!editing}
        title={
          editing
            ? t("personal.modalEdit", { defaultValue: "Editar personal" })
            : t("personal.modalNew", { defaultValue: "Nuevo personal" })
        }
        onClose={closeModal}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-700">{t("personal.fNombre", { defaultValue: "Nombre" })}</label>
            <input
              className="mt-1 w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-slate-400"
              value={form.nombre}
              onChange={(e) => setForm((s) => ({ ...s, nombre: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs text-slate-700">{t("personal.fApellido", { defaultValue: "Apellido" })}</label>
            <input
              className="mt-1 w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-slate-400"
              value={form.apellido}
              onChange={(e) => setForm((s) => ({ ...s, apellido: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs text-slate-700">{t("personal.fCedula", { defaultValue: "Cédula" })}</label>
            <input
              className="mt-1 w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-slate-400"
              value={form.cedula}
              onChange={(e) => setForm((s) => ({ ...s, cedula: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs text-slate-700">{t("personal.fTelefono", { defaultValue: "Teléfono" })}</label>
            <input
              className="mt-1 w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-slate-400"
              value={form.telefono}
              onChange={(e) => setForm((s) => ({ ...s, telefono: e.target.value }))}
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-slate-700">{t("personal.fEmail", { defaultValue: "Email" })}</label>
            <input
              className="mt-1 w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-slate-400"
              value={form.email}
              onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
            />
          </div>

          <div className="md:col-span-2 flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              checked={!!form.activo}
              onChange={(e) => setForm((s) => ({ ...s, activo: e.target.checked }))}
            />
            <span className="text-slate-800">{t("personal.fActivo", { defaultValue: "Activo" })}</span>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition disabled:opacity-60"
            onClick={closeModal}
            disabled={busy}
          >
            {t("common.cancel", { defaultValue: "Cancelar" })}
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-60"
            onClick={onSave}
            disabled={busy || !canEdit}
          >
            {busy ? t("common.saving", { defaultValue: "Guardando…" }) : t("common.save", { defaultValue: "Guardar" })}
          </button>
        </div>
      </Modal>
    </div>
  );
}
