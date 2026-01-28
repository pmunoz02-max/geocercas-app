import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * Personal.jsx (canónico, API-first)
 * - NO depende de personalApi.js (evita desalineaciones).
 * - Usa same-origin /api/personal y cookies (credentials: "include").
 * - Normaliza acciones vía POST: list / upsert / toggle / delete.
 * - ✅ Migrado a AuthContext NUEVO: loading, isAuthenticated, user, currentOrg, role, refreshContext
 */

function cls(...a) {
  return a.filter(Boolean).join(" ");
}

async function apiPersonal(payload) {
  const r = await fetch("/api/personal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.ok === false) {
    throw new Error(data?.error || `HTTP ${r.status}`);
  }
  return data;
}

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-[#0b1220] border border-white/10 shadow-xl">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="text-white font-semibold">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white px-2"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function Personal() {
  const { t } = useTranslation();

  // ✅ AuthContext NUEVO
  const { loading, isAuthenticated, user, currentOrg, role, refreshContext } = useAuth();

  const roleLower = String(role || "").toLowerCase();
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

  // Data load
  async function load() {
    setMsg("");
    if (!isAuthenticated || !currentOrg?.id) return;

    setBusy(true);
    try {
      const data = await apiPersonal({
        action: "list",
        org_id: currentOrg.id,
        q: q?.trim() || "",
      });
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      setMsg(e?.message || t("personal.errorLoad", { defaultValue: "Could not load." }));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // carga inicial: solo cuando boot auth listo + org presente
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
      const payload = {
        action: "upsert",
        org_id: currentOrg.id,
        row: {
          id: editing?.id,
          nombre: form.nombre?.trim(),
          apellido: form.apellido?.trim(),
          cedula: form.cedula?.trim(),
          telefono: form.telefono?.trim(),
          email: form.email?.trim(),
          activo: !!form.activo,
        },
      };

      await apiPersonal(payload);
      closeModal();
      await load();
    } catch (e) {
      setMsg(e?.message || t("personal.errorSave", { defaultValue: "Could not save." }));
    } finally {
      setBusy(false);
    }
  }

  async function onToggleActive(row) {
    if (!canEdit) return;
    setMsg("");
    setBusy(true);
    try {
      await apiPersonal({
        action: "toggle",
        org_id: currentOrg.id,
        id: row.id,
        activo: !(row.activo !== false),
      });
      await load();
    } catch (e) {
      setMsg(e?.message || t("personal.errorToggle", { defaultValue: "Could not change status." }));
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
      await apiPersonal({ action: "delete", org_id: currentOrg.id, id: row.id });
      await load();
    } catch (e) {
      setMsg(e?.message || t("personal.errorDelete", { defaultValue: "Could not delete." }));
    } finally {
      setBusy(false);
    }
  }

  // ✅ Guardas NUEVOS (sin ready / sin isLoggedIn)
  if (loading) {
    return (
      <div className="p-6 text-gray-300">
        {t("personal.bannerLoadingSession", { defaultValue: "Cargando sesión…" })}
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="p-6 text-red-400">
        {t("personal.bannerLoginRequired", { defaultValue: "Debes iniciar sesión." })}
      </div>
    );
  }

  if (!currentOrg?.id) {
    return (
      <div className="p-6 text-red-400">
        {t("personal.errorMissingTenant", { defaultValue: "No hay organización activa." })}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => refreshContext?.()}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white"
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
          <h1 className="text-2xl font-semibold mb-1 text-white">
            {t("personal.title", { defaultValue: "Personal" })}
          </h1>
          <div className="text-sm text-gray-300">
            {t("personal.roleLabel", { defaultValue: "Rol:" })}{" "}
            <span className="font-semibold">{(roleLower || "sin rol").toUpperCase()}</span> · Org:{" "}
            <span className="font-mono">{currentOrg.id}</span>
          </div>
        </div>

        {canEdit && (
          <button
            className="rounded-xl bg-slate-900 text-white px-4 py-2"
            onClick={() => setOpenNew(true)}
            type="button"
          >
            + {t("personal.buttonNew", { defaultValue: "Nuevo" })}
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-col md:flex-row gap-3 md:items-center">
        <input
          className="w-full md:w-[420px] rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-white outline-none"
          placeholder={t("personal.searchPlaceholder", { defaultValue: "Buscar…" })}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-xl bg-white/10 text-white px-4 py-2 border border-white/10"
            onClick={() => load()}
            disabled={busy}
          >
            {busy ? t("personal.loading", { defaultValue: "Cargando…" }) : t("personal.refresh", { defaultValue: "Actualizar" })}
          </button>

          <button
            type="button"
            className="rounded-xl bg-white/10 text-white px-4 py-2 border border-white/10"
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
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 px-4 py-3 text-sm">
          {msg}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm text-white">
          <thead className="bg-white/5">
            <tr>
              <th className="text-left px-4 py-3">{t("personal.colNombre", { defaultValue: "Nombre" })}</th>
              <th className="text-left px-4 py-3">{t("personal.colCedula", { defaultValue: "Cédula" })}</th>
              <th className="text-left px-4 py-3">{t("personal.colTelefono", { defaultValue: "Teléfono" })}</th>
              <th className="text-left px-4 py-3">{t("personal.colEmail", { defaultValue: "Email" })}</th>
              <th className="text-left px-4 py-3">{t("personal.colEstado", { defaultValue: "Estado" })}</th>
              <th className="text-right px-4 py-3">{t("personal.colAcciones", { defaultValue: "Acciones" })}</th>
            </tr>
          </thead>
          <tbody className="bg-black/20">
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="px-4 py-3">
                  <div className="font-medium">
                    {r.nombre || ""} {r.apellido || ""}
                  </div>
                </td>
                <td className="px-4 py-3">{r.cedula || ""}</td>
                <td className="px-4 py-3">{r.telefono || ""}</td>
                <td className="px-4 py-3">{r.email || ""}</td>
                <td className="px-4 py-3">
                  <span
                    className={cls(
                      "px-2 py-1 rounded-full text-xs border",
                      r.activo !== false
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                        : "bg-gray-500/10 border-gray-500/30 text-gray-200"
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
                      className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15"
                      onClick={() => openEdit(r)}
                      disabled={!canEdit || busy}
                      title="Editar"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15"
                      onClick={() => onToggleActive(r)}
                      disabled={!canEdit || busy}
                      title="Activar/Desactivar"
                    >
                      ⏻
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 hover:bg-red-500/25"
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
              <tr className="border-t border-white/5">
                <td className="px-4 py-6 text-white/60" colSpan={6}>
                  {t("personal.empty", { defaultValue: "No hay registros." })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={openNew || !!editing}
        title={editing ? t("personal.modalEdit", { defaultValue: "Editar personal" }) : t("personal.modalNew", { defaultValue: "Nuevo personal" })}
        onClose={closeModal}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-white/70">{t("personal.fNombre", { defaultValue: "Nombre" })}</label>
            <input
              className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-white outline-none"
              value={form.nombre}
              onChange={(e) => setForm((s) => ({ ...s, nombre: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs text-white/70">{t("personal.fApellido", { defaultValue: "Apellido" })}</label>
            <input
              className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-white outline-none"
              value={form.apellido}
              onChange={(e) => setForm((s) => ({ ...s, apellido: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs text-white/70">{t("personal.fCedula", { defaultValue: "Cédula" })}</label>
            <input
              className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-white outline-none"
              value={form.cedula}
              onChange={(e) => setForm((s) => ({ ...s, cedula: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs text-white/70">{t("personal.fTelefono", { defaultValue: "Teléfono" })}</label>
            <input
              className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-white outline-none"
              value={form.telefono}
              onChange={(e) => setForm((s) => ({ ...s, telefono: e.target.value }))}
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-white/70">{t("personal.fEmail", { defaultValue: "Email" })}</label>
            <input
              className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-white outline-none"
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
            <span className="text-white/80">{t("personal.fActivo", { defaultValue: "Activo" })}</span>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-white/10 border border-white/10 text-white"
            onClick={closeModal}
            disabled={busy}
          >
            {t("common.cancel", { defaultValue: "Cancelar" })}
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white"
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
