import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";
import {
  listPersonal,
  upsertPersonal,
  toggleVigente,
  deletePersonal,
} from "../lib/personalApi.js";

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 rounded-2xl bg-white shadow-xl text-slate-900">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100"
            onClick={onClose}
            type="button"
          >
            âœ•
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function getRowId(r) {
  return r?.id ?? r?.personal_id ?? r?.user_id ?? r?.usuario_id ?? null;
}

function upsertIntoList(list, item) {
  const id = getRowId(item);
  if (!id) return list;
  const next = Array.isArray(list) ? [...list] : [];
  const idx = next.findIndex((x) => getRowId(x) === id);
  if (idx >= 0) next[idx] = { ...next[idx], ...item };
  else next.unshift(item);
  return next;
}

export default function Personal() {
  const { t } = useTranslation();
  const { loading, ready, isLoggedIn, activeOrgId, currentRole } = useAuth();

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

  useEffect(() => {
    setItems([]);
    setMsg("");
    setOpenNew(false);
  }, [activeOrgId]);

  async function load({ qOverride, onlyActiveOverride } = {}) {
    if (!isLoggedIn || !activeOrgId) return;
    setBusy(true);
    setMsg("");
    try {
      const qToUse = typeof qOverride === "string" ? qOverride : q;
      const onlyActiveToUse =
        typeof onlyActiveOverride === "boolean" ? onlyActiveOverride : onlyActive;

      const rows = await listPersonal({
        q: qToUse,
        onlyActive: onlyActiveToUse,
        limit: 500,
        orgId: activeOrgId,
      });
      setItems(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setItems([]);
      setMsg(
        e?.message ||
          t("personal.errorLoad", { defaultValue: "Error loading personnel." })
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!loading && ready && isLoggedIn && activeOrgId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, ready, isLoggedIn, activeOrgId]);

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
    if (!canEdit) {
      setMsg(
        t("personal.errorNoPermissionCreate", {
          defaultValue: "You donâ€™t have permission.",
        })
      );
      return;
    }

    setSaving(true);
    setMsg("");

    try {
      const item = await upsertPersonal(
        { ...form, vigente: !!form.vigente },
        activeOrgId
      );

      // âœ… Si el backend no devolviÃ³ item, tratamos como error real
      const newId = getRowId(item);
      if (!item || !newId) {
        throw new Error("Save succeeded but server did not return item.");
      }

      // âœ… UI inmediata (NO dependemos del GET)
      setItems((curr) => upsertIntoList(curr, item));

      // cerrar modal + reset
      setOpenNew(false);
      setForm({
        nombre: "",
        apellido: "",
        email: "",
        telefono: "",
        vigente: true,
      });

      // limpiar bÃºsqueda para que no te oculte lo reciÃ©n creado
      setQ("");

      // opcional: refrescar lista real (pero no bloquea la UI)
      // Si el backend tarda en reflejar, igual ya lo ves por UI.
      load({ qOverride: "" });

      setMsg(
        t("personal.bannerCreated", {
          defaultValue: "Personnel created successfully.",
        })
      );
    } catch (e2) {
      setMsg(
        e2?.message ||
          t("personal.errorSave", {
            defaultValue: "Could not save personnel.",
          })
      );
    } finally {
      setSaving(false);
    }
  }

  async function onToggle(row) {
    if (!canEdit) {
      setMsg(
        t("personal.errorNoPermissionEdit", {
          defaultValue: "You donâ€™t have permission.",
        })
      );
      return;
    }

    const id = getRowId(row);
    if (!id) {
      setMsg("Missing row id (toggle).");
      return;
    }

    const prevItems = items;
    setItems((curr) =>
      curr.map((r) => (getRowId(r) === id ? { ...r, vigente: !r.vigente } : r))
    );

    try {
      setBusy(true);
      const item = await toggleVigente(id, activeOrgId);
      if (item && getRowId(item)) {
        setItems((curr) => upsertIntoList(curr, item));
      } else {
        // fallback: recarga
        await load();
      }
    } catch (e) {
      setItems(prevItems);
      setMsg(
        e?.message ||
          t("personal.errorToggle", {
            defaultValue: "Could not change status.",
          })
      );
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(row) {
    if (!canEdit) {
      setMsg(
        t("personal.errorNoPermissionDelete", {
          defaultValue: "You donâ€™t have permission.",
        })
      );
      return;
    }

    const id = getRowId(row);
    if (!id) {
      setMsg("Missing row id (delete).");
      return;
    }

    const ok = window.confirm(
      t("personal.confirmDelete", { defaultValue: "Delete this record?" })
    );
    if (!ok) return;

    // âœ… UI inmediato
    const prevItems = items;
    setItems((curr) => curr.filter((r) => getRowId(r) !== id));

    try {
      setBusy(true);
      await deletePersonal(id, activeOrgId);
      // NO hacemos load() aquÃ­ para evitar que reaparezca si el backend es soft-delete + list cache.
      setMsg(t("personal.bannerDeleted", { defaultValue: "Deleted." }));
    } catch (e) {
      setItems(prevItems);
      setMsg(
        e?.message ||
          t("personal.errorDelete", {
            defaultValue: "Could not delete.",
          })
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading || !ready)
    return (
      <div className="p-6 text-gray-300">
        {t("personal.bannerLoadingSession", { defaultValue: "Loading sessionâ€¦" })}
      </div>
    );

  if (!isLoggedIn)
    return (
      <div className="p-6 text-red-400">
        {t("personal.bannerLoginRequired", { defaultValue: "You must log in." })}
      </div>
    );

  if (!activeOrgId)
    return (
      <div className="p-6 text-red-400">
        {t("personal.errorMissingTenant", { defaultValue: "No organization selected." })}
      </div>
    );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-1 text-white">
            {t("personal.title", { defaultValue: "Personnel" })}
          </h1>
          <div className="text-sm text-gray-300">
            {t("personal.roleLabel", { defaultValue: "Role:" })}{" "}
            <span className="font-semibold">{role.toUpperCase()}</span> Â· Org:{" "}
            <span className="font-mono">{activeOrgId}</span>
          </div>
        </div>

        {canEdit && (
          <button
            className="rounded-xl bg-slate-900 text-white px-4 py-2"
            onClick={() => setOpenNew(true)}
            type="button"
          >
            + {t("personal.buttonNew", { defaultValue: "New" })}
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-col md:flex-row gap-3 md:items-center">
        <input
          className="w-full md:w-96 rounded-xl border px-3 py-2"
          placeholder={t("personal.searchPlaceholder", {
            defaultValue: "Search by name, last name, email or phoneâ€¦",
          })}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <label className="inline-flex items-center gap-2 text-sm text-gray-200">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => setOnlyActive(e.target.checked)}
          />
          {t("personal.onlyActive", { defaultValue: "Only active" })}
        </label>

        <button
          className="rounded-xl border px-4 py-2"
          onClick={() => load()}
          disabled={busy}
          type="button"
        >
          {busy
            ? t("personal.processing", { defaultValue: "Processingâ€¦" })
            : t("personal.buttonRefresh", { defaultValue: "Refresh" })}
        </button>
      </div>

      {msg && <div className="mt-4 text-sm text-yellow-200">{msg}</div>}

      <div className="mt-4 rounded-2xl border bg-white text-slate-900 overflow-hidden">
        {busy && filtered.length === 0 ? (
          <div className="p-4 text-gray-600">
            {t("personal.loading", { defaultValue: "Loadingâ€¦" })}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-gray-600">
            {t("personal.tableNoResults", { defaultValue: "No results." })}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="p-3">{t("personal.tableName", { defaultValue: "Name" })}</th>
                <th className="p-3">{t("personal.tableLastName", { defaultValue: "Last name" })}</th>
                <th className="p-3">{t("personal.tableEmail", { defaultValue: "Email" })}</th>
                <th className="p-3">{t("personal.tablePhone", { defaultValue: "Phone" })}</th>
                <th className="p-3">{t("personal.tableActive", { defaultValue: "Active" })}</th>
                <th className="p-3">{t("personal.actions", { defaultValue: "Actions" })}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const rid = getRowId(r) ?? `${r?.email ?? ""}-${r?.nombre ?? ""}`;
                return (
                  <tr key={rid} className="border-t">
                    <td className="p-3">{r?.nombre ?? "-"}</td>
                    <td className="p-3">{r?.apellido ?? "-"}</td>
                    <td className="p-3">{r?.email ?? "-"}</td>
                    <td className="p-3">{r?.telefono ?? "-"}</td>
                    <td className="p-3">
                      {r?.vigente
                        ? t("personal.yes", { defaultValue: "Yes" })
                        : t("personal.no", { defaultValue: "No" })}
                    </td>
                    <td className="p-3 flex gap-2">
                      <button
                        onClick={() => onToggle(r)}
                        disabled={!canEdit || busy}
                        className="rounded-lg border px-3 py-1"
                        type="button"
                      >
                        {r?.vigente
                          ? t("personal.actionDeactivate", { defaultValue: "Deactivate" })
                          : t("personal.actionActivate", { defaultValue: "Activate" })}
                      </button>

                      <button
                        onClick={() => onDelete(r)}
                        disabled={!canEdit || busy}
                        className="rounded-lg border border-red-200 text-red-700 px-3 py-1"
                        type="button"
                      >
                        {t("personal.actionDelete", { defaultValue: "Delete" })}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={openNew}
        title={t("personal.formTitleNew", { defaultValue: "Nuevo personal" })}
        onClose={() => setOpenNew(false)}
      >
        <form className="space-y-3" onSubmit={onSaveNew}>
          <input
            className="w-full rounded-xl border px-3 py-2"
            placeholder={t("personal.fieldName", { defaultValue: "Name" })}
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          />
          <input
            className="w-full rounded-xl border px-3 py-2"
            placeholder={t("personal.fieldLastName", { defaultValue: "Last name" })}
            value={form.apellido}
            onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value }))}
          />
          <input
            className="w-full rounded-xl border px-3 py-2"
            placeholder={t("personal.fieldEmail", { defaultValue: "Email" })}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <input
            className="w-full rounded-xl border px-3 py-2"
            placeholder={t("personal.fieldPhonePlaceholder", { defaultValue: "Phone" })}
            value={form.telefono}
            onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
          />

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!form.vigente}
              onChange={(e) => setForm((f) => ({ ...f, vigente: e.target.checked }))}
            />
            {t("personal.fieldActive", { defaultValue: "Active" })}
          </label>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-xl border px-4 py-2"
              onClick={() => setOpenNew(false)}
              disabled={saving}
            >
              {t("common.actions.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 text-white px-4 py-2"
              disabled={saving}
            >
              {saving
                ? t("personal.processing", { defaultValue: "Processingâ€¦" })
                : t("common.actions.save", { defaultValue: "Save" })}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

