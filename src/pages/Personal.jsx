import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";
import { listPersonal, upsertPersonal } from "../lib/personalApi.js";

function Modal({ open, title, children, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-lg rounded-2xl bg-white text-slate-900 shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function getRowId(row) {
  return row?.id ?? row?.personal_id ?? row?.user_id ?? row?.usuario_id ?? null;
}

function upsertIntoList(list, item) {
  const id = getRowId(item);
  if (!id) return Array.isArray(list) ? list : [];

  const next = Array.isArray(list) ? [...list] : [];
  const idx = next.findIndex((x) => getRowId(x) === id);

  if (idx >= 0) next[idx] = { ...next[idx], ...item };
  else next.unshift(item);

  return next;
}

function removeFromList(list, id) {
  if (!id) return Array.isArray(list) ? list : [];
  return (Array.isArray(list) ? list : []).filter((x) => getRowId(x) !== id);
}

function normalizeOrgId(value) {
  if (typeof value === "string") {
    const v = value.trim();
    return v && v !== "[object Object]" ? v : null;
  }

  if (value && typeof value === "object" && typeof value.id === "string") {
    const v = value.id.trim();
    return v && v !== "[object Object]" ? v : null;
  }

  return null;
}

export default function Personal() {
  const { t } = useTranslation();
  const { loading, ready, isLoggedIn, activeOrgId, currentRole } = useAuth();

  const role = String(currentRole || "").toLowerCase();
  const canEdit = role === "owner" || role === "admin";
  const resolvedOrgId = normalizeOrgId(activeOrgId);

  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState(null);
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
    setRowBusyId(null);
  }, [resolvedOrgId]);

  async function load(opts = {}) {
    if (!resolvedOrgId || !isLoggedIn) return;

    const onlyActiveValue =
      typeof opts.onlyActiveOverride === "boolean"
        ? opts.onlyActiveOverride
        : onlyActive;

    const qValue =
      typeof opts.qOverride === "string"
        ? opts.qOverride
        : q;

    try {
      setBusy(true);
      setMsg("");

      const data = await listPersonal(resolvedOrgId, {
        q: qValue || "",
        onlyActive: onlyActiveValue,
      });

      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setItems([]);
      setMsg(
        e?.message ||
          t("personal.errorLoad", {
            defaultValue: "Could not load personnel.",
          })
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!resolvedOrgId || !ready || !isLoggedIn) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedOrgId, ready, isLoggedIn]);

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
          defaultValue: "You don't have permission.",
        })
      );
      return;
    }

    if (!resolvedOrgId) {
      setMsg(
        t("personal.errorMissingTenant", {
          defaultValue: "No organization selected.",
        })
      );
      return;
    }

    setSaving(true);
    setMsg("");

    try {
      const item = await upsertPersonal(
        { ...form, vigente: !!form.vigente },
        resolvedOrgId
      );

      const newId = getRowId(item);
      if (!item || !newId) {
        throw new Error("Save succeeded but server did not return item.");
      }

      setItems((curr) => upsertIntoList(curr, item));
      setOpenNew(false);
      setForm({
        nombre: "",
        apellido: "",
        email: "",
        telefono: "",
        vigente: true,
      });
      setQ("");
      await load({ qOverride: "" });

      setMsg(
        t("personal.bannerCreated", {
          defaultValue: "Personnel created successfully.",
        })
      );
    } catch (e) {
      setMsg(
        e?.message ||
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
          defaultValue: "You don't have permission.",
        })
      );
      return;
    }

    const id = getRowId(row);
    if (!id) {
      setMsg("Missing row id (toggle).");
      return;
    }

    try {
      setRowBusyId(id);
      setMsg("");

      const result = await upsertPersonal({ id, action: "toggle" }, resolvedOrgId);
      const updatedItem = result?.item || null;

      if (updatedItem) {
        setItems((curr) => upsertIntoList(curr, updatedItem));
      }

      if (row?.vigente && onlyActive) {
        setOnlyActive(false);
        await load({ onlyActiveOverride: false });
        setMsg(
          t("personal.bannerDeactivatedShowInactive", {
            defaultValue: "Record deactivated. Inactive records are now shown.",
          })
        );
      } else {
        await load();
        setMsg(
          row?.vigente
            ? t("personal.bannerDeactivated", {
                defaultValue: "Personnel deactivated.",
              })
            : t("personal.bannerActivated", {
                defaultValue: "Personnel activated.",
              })
        );
      }
    } catch (e) {
      setMsg(
        e?.message ||
          t("personal.errorToggle", {
            defaultValue: "Could not change status.",
          })
      );
    } finally {
      setRowBusyId(null);
    }
  }

  async function onDelete(row) {
    if (!canEdit) {
      setMsg(
        t("personal.errorNoPermissionDelete", {
          defaultValue: "You don't have permission.",
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

    try {
      setRowBusyId(id);
      setMsg("");

      await upsertPersonal({ id, action: "delete" }, resolvedOrgId);
      setItems((curr) => removeFromList(curr, id));
      await load();

      setMsg(
        t("personal.bannerDeleted", {
          defaultValue: "Deleted.",
        })
      );
    } catch (e) {
      setMsg(
        e?.message ||
          t("personal.errorDelete", {
            defaultValue: "Could not delete.",
          })
      );
    } finally {
      setRowBusyId(null);
    }
  }

  if (loading || !ready) {
    return (
      <div className="p-6 text-gray-300">
        {t("personal.bannerLoadingSession", { defaultValue: "Loading session..." })}
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="p-6 text-red-400">
        {t("personal.bannerLoginRequired", { defaultValue: "You must log in." })}
      </div>
    );
  }

  if (!resolvedOrgId) {
    return (
      <div className="p-6 text-red-400">
        {t("personal.errorMissingTenant", {
          defaultValue: "No organization selected.",
        })}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-white">
            {t("personal.title", { defaultValue: "Personnel" })}
          </h1>
          <div className="text-sm text-gray-300">
            {t("personal.roleLabel", { defaultValue: "Role:" })}{" "}
            <span className="font-semibold">{role.toUpperCase()}</span> · Org:{" "}
            <span className="font-mono">{resolvedOrgId}</span>
          </div>
        </div>

        {canEdit && (
          <button
            className="rounded-xl bg-slate-900 px-4 py-2 text-white"
            onClick={() => setOpenNew(true)}
            type="button"
          >
            + {t("personal.buttonNew", { defaultValue: "New" })}
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
        <input
          className="w-full rounded-xl border px-3 py-2 md:w-96"
          placeholder={t("personal.searchPlaceholder", {
            defaultValue: "Search by name, last name, email or phone...",
          })}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <label className="inline-flex items-center gap-2 text-sm text-gray-200">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={async (e) => {
              const val = e.target.checked;
              setOnlyActive(val);
              await load({ onlyActiveOverride: val });
            }}
          />
          {t("personal.onlyActive", { defaultValue: "Show only active" })}
        </label>

        <button
          className="rounded-xl border px-4 py-2"
          onClick={() => load()}
          disabled={busy}
          type="button"
        >
          {busy
            ? t("personal.processing", { defaultValue: "Processing..." })
            : t("personal.buttonRefresh", { defaultValue: "Refresh" })}
        </button>
      </div>

      {msg && <div className="mt-4 text-sm text-yellow-200">{msg}</div>}

      <div className="mt-4 overflow-hidden rounded-2xl border bg-white text-slate-900">
        {busy && filtered.length === 0 ? (
          <div className="p-4 text-gray-600">
            {t("personal.loading", { defaultValue: "Loading..." })}
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
                <th className="p-3">
                  {t("personal.tableLastName", { defaultValue: "Last name" })}
                </th>
                <th className="p-3">{t("personal.tableEmail", { defaultValue: "Email" })}</th>
                <th className="p-3">{t("personal.tablePhone", { defaultValue: "Phone" })}</th>
                <th className="p-3">{t("personal.tableActive", { defaultValue: "Active" })}</th>
                <th className="p-3">{t("personal.actions", { defaultValue: "Actions" })}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const rid = getRowId(r) ?? `${r?.email ?? ""}-${r?.nombre ?? ""}`;
                const rowId = getRowId(r);
                const isRowBusy = rowBusyId === rowId;

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
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onToggle(r)}
                          disabled={!canEdit || isRowBusy}
                          className="rounded-lg border px-3 py-1"
                        >
                          {r?.vigente
                            ? t("personal.actionDeactivate", {
                                defaultValue: "Deactivate",
                              })
                            : t("personal.actionActivate", {
                                defaultValue: "Activate",
                              })}
                        </button>

                        <button
                          type="button"
                          onClick={() => onDelete(r)}
                          disabled={!canEdit || isRowBusy}
                          className="rounded-lg border border-red-200 px-3 py-1 text-red-700"
                        >
                          {t("personal.actionDelete", { defaultValue: "Delete" })}
                        </button>
                      </div>
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
            placeholder={t("personal.fieldPhonePlaceholder", {
              defaultValue: "Phone",
            })}
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

          <div className="flex justify-end gap-2 pt-2">
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
              className="rounded-xl bg-slate-900 px-4 py-2 text-white"
              disabled={saving}
            >
              {saving
                ? t("personal.processing", { defaultValue: "Processing..." })
                : t("common.actions.save", { defaultValue: "Save" })}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}