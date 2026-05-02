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
  // Plan limit modal state
  const [planLimitModalOpen, setPlanLimitModalOpen] = useState(false);
  const [planLimitDetails, setPlanLimitDetails] = useState(null);

  function openPlanLimitModal(details = null) {
    setPlanLimitDetails(details || null);
    setPlanLimitModalOpen(true);
  }

  function closePlanLimitModal() {
    setPlanLimitModalOpen(false);
    setPlanLimitDetails(null);
  }

  function goToUpgrade() {
    window.location.href = "/billing";
  }
  const { t } = useTranslation();
  const { loading, ready, isLoggedIn, activeOrgId, currentRole } = useAuth();

  const role = String(currentRole || "").toLowerCase();
  const canEdit = role === "owner" || role === "admin";

  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [items, setItems] = useState([]);
  const [plan, setPlan] = useState(null);

  const limitReached =
    plan?.max_members != null &&
    Number(plan?.active_count || 0) >= Number(plan?.max_members || 0);

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

  const load = React.useCallback(async ({ qOverride, onlyActiveOverride } = {}) => {
    if (!isLoggedIn || !activeOrgId) return;

    setBusy(true);
    setMsg("");

    try {
      const qToUse = typeof qOverride === "string" ? qOverride : q;
      const onlyActiveToUse =
        typeof onlyActiveOverride === "boolean" ? onlyActiveOverride : onlyActive;

            const rawResult = await listPersonal({
        q: qToUse,
        onlyActive: onlyActiveToUse,
        limit: 500,
        orgId: activeOrgId,
      });


      const loadedItems = Array.isArray(rawResult?.items)
        ? rawResult.items
        : Array.isArray(rawResult)
          ? rawResult
          : [];

      const loadedPlan = rawResult && !Array.isArray(rawResult) ? (rawResult?.plan ?? null) : null;

      setItems(Array.isArray(loadedItems) ? loadedItems : []);
      setPlan(loadedPlan);
    } catch (e) {
      if (
        e?.message?.includes("Plan limit reached") ||
        e?.error === "Plan limit reached"
      ) {
        openPlanLimitModal(e?.details || null);
        return;
      }
      setItems([]);
      setMsg(e?.message || "Error loading personnel.");
    } finally {
      setBusy(false);
    }
  }, [isLoggedIn, activeOrgId, q, onlyActive]);

  useEffect(() => {
    if (!isLoggedIn || !activeOrgId) return;
    load({ qOverride: "", onlyActiveOverride: onlyActive });
  }, [isLoggedIn, activeOrgId]);

  const filtered = useMemo(() => {
    const base = Array.isArray(items) ? items : [];
    const qn = String(q || "").trim().toLowerCase();

    return base.filter((item) => {
      if (onlyActive && !item?.vigente) return false;

      if (!qn) return true;

      const nombre = String(item?.nombre || "").toLowerCase();
      const apellido = String(item?.apellido || "").toLowerCase();
      const email = String(item?.email || "").toLowerCase();
      const telefono = String(item?.telefono || item?.telefono_raw || "").toLowerCase();

      return (
        nombre.includes(qn) ||
        apellido.includes(qn) ||
        email.includes(qn) ||
        telefono.includes(qn)
      );
    });
  }, [items, q, onlyActive]);

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
      if (e2?.status === 409 && e2?.error === "Plan limit reached") {
        openPlanLimitModal(e2?.details || null);
        return;
      }
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
      if (e?.status === 409 && e?.error === "Plan limit reached") {
        openPlanLimitModal(e?.details || null);
        return;
      }
      setItems(prevItems);
      setMsg(
        e?.message ||
          t("personal.errorToggle", {
            defaultValue: "Could not change status.",
          })
      );
          {planLimitModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-slate-900">
                  Has alcanzado el límite de tu plan
                </h3>

                <p className="mt-2 text-sm text-slate-600">
                  Para seguir agregando o activando personal, necesitas ampliar tu plan.
                </p>

                <div className="mt-4 rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Uso actual: {planLimitDetails?.current_active ?? 0} / {planLimitDetails?.limit ?? "-"}
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    onClick={closePlanLimitModal}
                    className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    Cerrar
                  </button>

                  <button
                    onClick={goToUpgrade}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    {t("personal.upgradeNow", { defaultValue: "Upgrade now" })}
                  </button>
                </div>
              </div>
            </div>
          )}
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
      if (
        e?.message?.includes("Plan limit reached") ||
        e?.error === "Plan limit reached"
      ) {
        openPlanLimitModal(e?.details || null);
        return;
      }
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
        {t("personal.bannerLoadingSession", { defaultValue: "Loading session…" })}
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
      <div className="flex items-center justify-end gap-3 mb-4">
        {plan?.max_members != null && (
          <div className="text-sm bg-gray-100 px-3 py-2 rounded-lg border">
            {plan?.active_count ?? 0} de {plan?.max_members} usados
          </div>
        )}
        <button
          onClick={goToUpgrade}
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${
            limitReached
              ? "bg-red-600 text-white"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {t("personal.upgrade", { defaultValue: "Upgrade 🚀" })}
        </button>
        <button
          onClick={() => setOpenNew(true)}
          disabled={limitReached}
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${
            limitReached
              ? "bg-gray-300 text-gray-600 cursor-not-allowed"
              : "bg-slate-900 text-white"
          }`}
        >
          {t("personal.buttonNew", { defaultValue: "+ New" })}
        </button>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-1 text-white">
            {t("personal.title", { defaultValue: "Personnel" })}
          </h1>
          <div className="text-sm text-gray-300">
            {t("personal.roleLabel", { defaultValue: "Role:" })}:{" "}
            <span className="font-semibold">{role.toUpperCase()}</span> · Org:{" "}
            <span className="font-mono">{activeOrgId}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col md:flex-row gap-3 md:items-center">
        <input
          className="w-full md:w-96 rounded-xl border px-3 py-2"
          placeholder={t("personal.searchPlaceholder", {
            defaultValue: "Search by name, last name, email or phone…",
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
            ? t("personal.processing", { defaultValue: "Processing…" })
            : t("personal.buttonRefresh", { defaultValue: "Refresh" })}
        </button>
      </div>

      {msg && <div className="mt-4 text-sm text-yellow-200">{msg}</div>}

      <div className="mt-4 rounded-2xl border bg-white text-slate-900 overflow-hidden">
        {busy && filtered.length === 0 ? (
          <div className="p-4 text-gray-600">
            {t("personal.loading", { defaultValue: "Loading…" })}
          </div>
        ) : filtered.length === 0 ? (
          onlyActive && items.length === 0 ? (
            <div className="p-6 text-center text-gray-600">
              <div className="text-lg font-semibold mb-2">{t("personal.emptyActiveTitle", { defaultValue: "No active staff" })}</div>
              <div className="mb-2">{t("personal.emptyActiveDesc", { defaultValue: "There are no active staff members. Try unchecking the 'Only active' filter to see all staff." })}</div>
            </div>
          ) : (
            <div className="p-4 text-gray-600">
              {t("personal.tableNoResults", { defaultValue: "No results." })}
            </div>
          )
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
              {filtered.map((r, idx) => (
                <tr key={r?.id || idx} className="border-t">
                  <td className="p-3">{r?.nombre ?? "-"}</td>
                  <td className="p-3">{r?.apellido ?? "-"}</td>
                  <td className="p-3">{r?.email ?? "-"}</td>
                  <td className="p-3">{r?.telefono ?? "-"}</td>
                  <td className="p-3">{r?.vigente ? "Yes" : "No"}</td>
                  <td className="p-3 flex gap-2">
                    <button
                      onClick={() => onToggle(r)}
                      className="px-2 py-1 rounded bg-blue-100 text-blue-800 hover:bg-blue-200"
                      type="button"
                    >
                      {r?.vigente ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => onDelete(r)}
                      className="px-2 py-1 rounded bg-red-100 text-red-800 hover:bg-red-200"
                      type="button"
                    >
                      Delete
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
                ? t("personal.processing", { defaultValue: "Processing…" })
                : t("common.actions.save", { defaultValue: "Save" })}
            </button>
          </div>
        </form>
      </Modal>
          {planLimitModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-slate-900">
                  Has alcanzado el límite de tu plan
                </h3>

                <p className="mt-2 text-sm text-slate-600">
                  Para seguir agregando o activando personal, necesitas ampliar tu plan.
                </p>

                {(planLimitDetails?.current_active != null || planLimitDetails?.limit != null) && (
                  <div className="mt-4 rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    Uso actual: {planLimitDetails?.current_active ?? 0}
                    {" / "}
                    {planLimitDetails?.limit ?? "-"}
                  </div>
                )}

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    onClick={closePlanLimitModal}
                    className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    Cerrar
                  </button>

                  <button
                    onClick={goToUpgrade}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    {t("personal.upgradeNow", { defaultValue: "Upgrade now" })}
                  </button>
                </div>
              </div>
            </div>
          )}
    </div>
  );
}

