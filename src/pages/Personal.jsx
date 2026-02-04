import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient";

/**
 * src/pages/Personal.jsx — i18n edition
 * - Mantiene tu lógica Supabase/RLS/orden universal
 * - Cambia TODOS los textos a t(...)
 */

function cls(...a) {
  return a.filter(Boolean).join(" ");
}

function Modal({ open, title, children, onClose, t }) {
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
            aria-label={t("common.actions.close", { defaultValue: "Cerrar" })}
            title={t("common.actions.close", { defaultValue: "Cerrar" })}
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

/* =========================
   ORDEN UNIVERSAL (cliente)
========================= */

function norm(v) {
  return String(v || "").trim().toLowerCase();
}

function isDeletedRow(r) {
  return !!r?.is_deleted || !!r?.deleted_at;
}

function isVigenteActivaRow(r) {
  if (isDeletedRow(r)) return false;

  const vigente = r?.vigente !== false;
  const activo = r?.activo_bool === true || r?.activo === true;

  return vigente && activo;
}

function rankRow(r) {
  if (isDeletedRow(r)) return 2;
  if (isVigenteActivaRow(r)) return 0;
  return 1;
}

function sortPersonal(rows) {
  const arr = Array.isArray(rows) ? [...rows] : [];
  arr.sort((a, b) => {
    const ra = rankRow(a);
    const rb = rankRow(b);
    if (ra !== rb) return ra - rb;

    const last = norm(a?.apellido).localeCompare(norm(b?.apellido));
    if (last !== 0) return last;

    const first = norm(a?.nombre).localeCompare(norm(b?.nombre));
    if (first !== 0) return first;

    const email = norm(a?.email).localeCompare(norm(b?.email));
    if (email !== 0) return email;

    return norm(a?.id).localeCompare(norm(b?.id));
  });
  return arr;
}

export default function Personal() {
  const { t } = useTranslation();
  const { loading, isAuthenticated, user, currentOrg, role, refreshContext } = useAuth();

  // ✅ Rol efectivo (si AuthContext falla, lo resolvemos acá)
  const [effectiveRole, setEffectiveRole] = useState(role ?? null);
  const [roleBusy, setRoleBusy] = useState(false);

  useEffect(() => {
    setEffectiveRole(role ?? null);
  }, [role]);

  async function resolveRoleFallback() {
    if (!isAuthenticated || !user?.id || !currentOrg?.id) return;
    if (role) return;
    if (roleBusy) return;

    setRoleBusy(true);
    try {
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
        refreshContext?.();
        return;
      }

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

  const roleLower = useMemo(() => String(effectiveRole || "").toLowerCase(), [effectiveRole]);
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
    if (!nombre) return t("personal.errorMissingName", { defaultValue: "El nombre es obligatorio." });
    if (!email) return t("personal.errorMissingEmail", { defaultValue: "El email es obligatorio." });
    return null;
  }

  async function load() {
    setMsg("");
    if (!isAuthenticated || !currentOrg?.id) return;

    setBusy(true);
    try {
      let qy = supabase.from("personal").select("*").eq("org_id", currentOrg.id).limit(500);

      const or = buildOrFilter(q);
      if (or) qy = qy.or(or);

      const { data, error } = await qy;
      if (error) throw error;

      setRows(sortPersonal(Array.isArray(data) ? data : []));
    } catch (e) {
      console.error("[Personal] load error", e);
      setMsg(e?.message || t("personal.errorLoad", { defaultValue: "No se pudo cargar el listado." }));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const run = async () => {
      if (!loading && isAuthenticated && currentOrg?.id) await load();
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
      setMsg(e?.message || t("personal.errorToggle", { defaultValue: "No se pudo cambiar el estado." }));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(row) {
    if (!canEdit) return;

    const ok = window.confirm(
      t("personal.confirmDelete", { defaultValue: "¿Eliminar este registro?" })
    );
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
      setMsg(e?.message || t("personal.errorDelete", { defaultValue: "No se pudo eliminar." }));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-6 text-slate-600">{t("common.actions.loading", { defaultValue: "Cargando…" })}</div>;

  if (!isAuthenticated || !user) {
    return (
      <div className="p-6 text-red-700 bg-red-50 border border-red-200 rounded-xl">
        {t("auth.loginRequired", { defaultValue: "Debes iniciar sesión." })}
      </div>
    );
  }

  if (!currentOrg?.id) {
    return (
      <div className="p-6 text-red-700 bg-red-50 border border-red-200 rounded-xl">
        {t("personal.errorMissingOrg", { defaultValue: "No hay organización activa." })}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => refreshContext?.()}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition"
          >
            {t("common.refreshContext", { defaultValue: "Reintentar contexto" })}
          </button>
        </div>
      </div>
    );
  }

  const roleLabelUi =
    roleBusy && !effectiveRole
      ? t("common.actions.loading", { defaultValue: "Cargando…" }).toUpperCase()
      : (roleLower || t("personal.roleNone", { defaultValue: "sin rol" })).toUpperCase();

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-1 text-slate-900">
            {t("personal.title", { defaultValue: "Personal" })}
          </h1>
          <div className="text-sm text-slate-700">
            {t("personal.roleLabel", { defaultValue: "Rol" })}:{" "}
            <span className="font-semibold text-slate-900">{roleLabelUi}</span> ·{" "}
            {t("personal.orgLabel", { defaultValue: "Org" })}:{" "}
            <span className="font-mono text-slate-700">{currentOrg.id}</span>
          </div>
        </div>

        {canEdit && (
          <button
            className="rounded-xl bg-slate-900 text-white px-4 py-2 hover:bg-slate-800 transition"
            onClick={() => setOpenNew(true)}
            type="button"
          >
            {t("personal.newButton", { defaultValue: "+ Nuevo" })}
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-col md:flex-row gap-3 md:items-center">
        <input
          className="w-full md:w-[520px] rounded-xl bg-white border border-slate-300 px-4 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
          placeholder={t("personal.searchPlaceholder", {
            defaultValue: "Buscar por nombre, apellido, email o teléfono…",
          })}
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
              ? t("common.actions.loading", { defaultValue: "Cargando…" })
              : t("common.actions.refresh", { defaultValue: "Actualizar" })}
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
            {t("common.actions.clear", { defaultValue: "Limpiar" })}
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
                {t("personal.table.name", { defaultValue: "Nombre" })}
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                {t("personal.table.phone", { defaultValue: "Teléfono" })}
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                {t("personal.table.email", { defaultValue: "Email" })}
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                {t("personal.table.status", { defaultValue: "Estado" })}
              </th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700">
                {t("personal.table.actions", { defaultValue: "Acciones" })}
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const deleted = isDeletedRow(r);
              const vigente = r.vigente !== false && !deleted;

              return (
                <tr key={r.id} className="border-t border-slate-200 hover:bg-slate-50 transition">
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
                      {vigente
                        ? t("personal.status.active", { defaultValue: "Vigente" })
                        : deleted
                        ? t("personal.status.deleted", { defaultValue: "Eliminado" })
                        : t("personal.status.inactive", { defaultValue: "No vigente" })}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition disabled:opacity-60"
                        onClick={() => openEdit(r)}
                        disabled={!canEdit || busy}
                        title={t("common.actions.edit", { defaultValue: "Editar" })}
                      >
                        ✎
                      </button>

                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition disabled:opacity-60"
                        onClick={() => onToggleVigente(r)}
                        disabled={!canEdit || busy || deleted}
                        title={t("personal.toggleVigente", { defaultValue: "Vigente / No vigente" })}
                      >
                        ⏻
                      </button>

                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-60"
                        onClick={() => onDelete(r)}
                        disabled={!canEdit || busy}
                        title={t("common.actions.delete", { defaultValue: "Eliminar" })}
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
                <td colSpan={5} className="px-4 py-8 text-center text-slate-600 font-medium bg-slate-50">
                  {t("personal.table.empty", { defaultValue: "No hay registros en esta organización." })}
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
            ? t("personal.modal.editTitle", { defaultValue: "Editar personal" })
            : t("personal.modal.newTitle", { defaultValue: "Nuevo personal" })
        }
        onClose={closeModal}
        t={t}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-700">
              {t("personal.form.firstName", { defaultValue: "Nombre" })} *
            </label>
            <input
              className="mt-1 w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-slate-400"
              value={form.nombre}
              onChange={(e) => setForm((s) => ({ ...s, nombre: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs text-slate-700">
              {t("personal.form.lastName", { defaultValue: "Apellido" })}
            </label>
            <input
              className="mt-1 w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-slate-400"
              value={form.apellido}
              onChange={(e) => setForm((s) => ({ ...s, apellido: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs text-slate-700">
              {t("personal.form.phone", { defaultValue: "Teléfono" })}
            </label>
            <input
              className="mt-1 w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-slate-400"
              value={form.telefono}
              onChange={(e) => setForm((s) => ({ ...s, telefono: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs text-slate-700">
              {t("personal.form.email", { defaultValue: "Email" })} *
            </label>
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
              onChange={(e) => setForm((s) => ({ ...s, vigente: e.target.checked }))}
            />
            <span className="text-slate-800">
              {t("personal.form.vigente", { defaultValue: "Vigente" })}
            </span>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition disabled:opacity-60"
            onClick={closeModal}
            disabled={busy}
          >
            {t("common.actions.cancel", { defaultValue: "Cancelar" })}
          </button>

          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-60"
            onClick={onSave}
            disabled={busy || !canEdit}
          >
            {busy
              ? t("common.actions.saving", { defaultValue: "Guardando…" })
              : t("common.actions.save", { defaultValue: "Guardar" })}
          </button>
        </div>
      </Modal>
    </div>
  );
}
