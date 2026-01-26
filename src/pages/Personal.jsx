import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * Personal.jsx (canónico, API-first)
 * - NO depende de personalApi.js (evita desalineaciones).
 * - Usa same-origin /api/personal y cookies (credentials: "include").
 * - Normaliza acciones vía POST: list / upsert / toggle / delete.
 */

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

async function safeReadJson(resp) {
  const text = await resp.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { _nonJson: true, text };
  }
}

async function apiPersonal(body, { timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch("/api/personal", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "include",
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });

    const data = await safeReadJson(resp);

    if (!resp.ok) {
      const msg =
        (data && (data.error || data.message)) ||
        `HTTP ${resp.status} ${resp.statusText}`;
      const details = data && (data.details || data.detail);
      const err = new Error(details ? `${msg} — ${details}` : msg);
      err.status = resp.status;
      err.payload = data;
      throw err;
    }

    return data;
  } finally {
    clearTimeout(to);
  }
}

async function apiPersonalList({ q, onlyActive, limit }) {
  // Preferimos GET si existe, pero fallback a POST list.
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (typeof onlyActive === "boolean") params.set("onlyActive", onlyActive ? "1" : "0");
  if (limit) params.set("limit", String(limit));

  try {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 12000);
    const resp = await fetch(`/api/personal?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
      signal: controller.signal,
    });
    clearTimeout(to);

    if (!resp.ok) throw new Error(`GET /api/personal failed: ${resp.status}`);
    const data = await safeReadJson(resp);

    // Formatos tolerados:
    // - { items: [...] }
    // - [...]
    // - { data: [...] }
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
  } catch {
    const data = await apiPersonal({ action: "list", q, onlyActive, limit });
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
  }
}

export default function Personal() {
  const { t } = useTranslation();
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
    if (!isLoggedIn || !currentOrg?.id) return;
    setBusy(true);
    setMsg("");
    try {
      const rows = await apiPersonalList({ q, onlyActive, limit: 500 });
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

  // Carga inicial
  useEffect(() => {
    if (!loading && ready && isLoggedIn && currentOrg?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, ready, isLoggedIn, currentOrg?.id]);

  // Auto-refresco al cambiar filtros (debounce)
  useEffect(() => {
    if (!loading && ready && isLoggedIn && currentOrg?.id) {
      const id = setTimeout(() => load(), 250);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, onlyActive]);

  const filtered = useMemo(() => {
    if (!q) return items;
    const ql = q.toLowerCase();
    return items.filter((r) =>
      `${r?.nombre ?? ""} ${r?.apellido ?? ""} ${r?.email ?? ""} ${r?.telefono ?? ""}`
        .toLowerCase()
        .includes(ql)
    );
  }, [items, q]);

  function validateForm() {
    const nombre = String(form.nombre || "").trim();
    const apellido = String(form.apellido || "").trim();
    const email = String(form.email || "").trim();

    if (!nombre) {
      return t("personal.errorNameRequired", { defaultValue: "Name is required." });
    }
    if (!apellido) {
      return t("personal.errorLastNameRequired", {
        defaultValue: "Last name is required.",
      });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return t("personal.errorEmailInvalid", { defaultValue: "Invalid email." });
    }
    return null;
  }

  async function onSaveNew(e) {
    e.preventDefault();
    if (!canEdit) {
      setMsg(t("personal.errorNoPermissionCreate", { defaultValue: "No permission." }));
      return;
    }

    const vErr = validateForm();
    if (vErr) {
      setMsg(vErr);
      return;
    }

    setSaving(true);
    setMsg("");
    try {
      await apiPersonal({
        action: "upsert",
        ...form,
        vigente: !!form.vigente,
      });

      setOpenNew(false);
      setForm({
        nombre: "",
        apellido: "",
        email: "",
        telefono: "",
        vigente: true,
      });

      await load();
      setMsg(t("personal.bannerCreated", { defaultValue: "Created successfully." }));
    } catch (e2) {
      setMsg(
        e2?.message ||
          t("personal.errorSave", { defaultValue: "Could not save personnel." })
      );
    } finally {
      setSaving(false);
    }
  }

  async function onToggle(row) {
    if (!canEdit) {
      setMsg(t("personal.errorNoPermissionEdit", { defaultValue: "No permission." }));
      return;
    }
    try {
      setBusy(true);
      await apiPersonal({ action: "toggle", id: row.id });
      await load();
    } catch (e) {
      setMsg(
        e?.message ||
          t("personal.errorToggle", { defaultValue: "Could not change status." })
      );
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(row) {
    if (!canEdit) {
      setMsg(t("personal.errorNoPermissionDelete", { defaultValue: "No permission." }));
      return;
    }
    if (!window.confirm(t("personal.confirmDelete", { defaultValue: "Delete this record?" }))) return;

    try {
      setBusy(true);
      await apiPersonal({ action: "delete", id: row.id });
      await load();
    } catch (e) {
      setMsg(e?.message || t("personal.errorDelete", { defaultValue: "Could not delete." }));
    } finally {
      setBusy(false);
    }
  }

  if (loading || !ready) {
    return (
      <div className="p-6 text-gray-300">
        {t("personal.bannerLoadingSession", { defaultValue: "Loading session…" })}
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

  if (!currentOrg?.id) {
    return (
      <div className="p-6 text-red-400">
        {t("personal.errorMissingTenant", { defaultValue: "No organization selected." })}
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
            <span className="font-semibold">{role.toUpperCase()}</span> · Org:{" "}
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
          className="w-full md:w-96 rounded-xl border px-3 py-2"
          placeholder={t("personal.searchPlaceholder", { defaultValue: "Buscar…" })}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <label className="inline-flex items-center gap-2 text-sm text-gray-200">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => setOnlyActive(e.target.checked)}
          />
          {t("personal.onlyActive", { defaultValue: "Solo activos" })}
        </label>

        <button
          className="rounded-xl border px-4 py-2"
          onClick={load}
          disabled={busy}
          type="button"
        >
          {busy
            ? t("personal.processing", { defaultValue: "Procesando…" })
            : t("personal.buttonRefresh", { defaultValue: "Refrescar" })}
        </button>
      </div>

      {msg && <div className="mt-4 text-sm text-yellow-200">{msg}</div>}

      <div className="mt-4 rounded-2xl border bg-white text-slate-900 overflow-hidden">
        {busy && filtered.length === 0 ? (
          <div className="p-4 text-gray-600">
            {t("personal.loading", { defaultValue: "Cargando…" })}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-gray-600">
            {t("personal.tableNoResults", { defaultValue: "Sin resultados." })}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="p-3 text-left">{t("personal.tableName", { defaultValue: "Nombre" })}</th>
                <th className="p-3 text-left">{t("personal.tableLastName", { defaultValue: "Apellido" })}</th>
                <th className="p-3 text-left">{t("personal.tableEmail", { defaultValue: "Email" })}</th>
                <th className="p-3 text-left">{t("personal.tablePhone", { defaultValue: "Teléfono" })}</th>
                <th className="p-3 text-left">{t("personal.tableActive", { defaultValue: "Activo" })}</th>
                <th className="p-3 text-left">{t("personal.actions", { defaultValue: "Acciones" })}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{r?.nombre ?? "-"}</td>
                  <td className="p-3">{r?.apellido ?? "-"}</td>
                  <td className="p-3">{r?.email ?? "-"}</td>
                  <td className="p-3">{r?.telefono ?? "-"}</td>
                  <td className="p-3">
                    {r?.vigente
                      ? t("personal.yes", { defaultValue: "Sí" })
                      : t("personal.no", { defaultValue: "No" })}
                  </td>
                  <td className="p-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => onToggle(r)}
                      disabled={!canEdit || busy}
                      className="rounded-lg border px-3 py-1"
                      type="button"
                    >
                      {r?.vigente
                        ? t("personal.actionDeactivate", { defaultValue: "Desactivar" })
                        : t("personal.actionActivate", { defaultValue: "Activar" })}
                    </button>
                    <button
                      onClick={() => onDelete(r)}
                      disabled={!canEdit || busy}
                      className="rounded-lg border border-red-200 text-red-700 px-3 py-1"
                      type="button"
                    >
                      {t("personal.actionDelete", { defaultValue: "Eliminar" })}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={openNew}
        title={t("personal.formTitleNew", { defaultValue: "Nuevo personal" })}
        onClose={() => (saving ? null : setOpenNew(false))}
      >
        <form className="space-y-3" onSubmit={onSaveNew}>
          <input
            className="w-full rounded-xl border px-3 py-2"
            placeholder={t("personal.fieldName", { defaultValue: "Nombre" })}
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          />
          <input
            className="w-full rounded-xl border px-3 py-2"
            placeholder={t("personal.fieldLastName", { defaultValue: "Apellido" })}
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
            placeholder={t("personal.fieldPhonePlaceholder", { defaultValue: "Teléfono" })}
            value={form.telefono}
            onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
          />

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!form.vigente}
              onChange={(e) => setForm((f) => ({ ...f, vigente: e.target.checked }))}
            />
            {t("personal.fieldActive", { defaultValue: "Activo" })}
          </label>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-xl border px-4 py-2"
              onClick={() => setOpenNew(false)}
              disabled={saving}
            >
              {t("common.actions.cancel", { defaultValue: "Cancelar" })}
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 text-white px-4 py-2"
              disabled={saving}
            >
              {saving
                ? t("personal.processing", { defaultValue: "Procesando…" })
                : t("common.actions.save", { defaultValue: "Guardar" })}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
