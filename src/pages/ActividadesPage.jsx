import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";

const TABLE = "activities";

// Si quieres "LOCAL" también, agrégalo aquí.
const CURRENCIES = ["USD", "EUR", "MXN", "COP", "PEN", "CLP", "ARS", "BRL", "CAD", "GBP"];

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export default function ActividadesPage() {
  const { t } = useTranslation();

  // ⚠️ Usamos loading (no ready), porque ready puede no existir
  const { loading, isAuthenticated, user, currentOrg, role, currentRole } = useAuth();

  const effectiveRole = useMemo(
    () => String(currentRole || role || "").toLowerCase(),
    [currentRole, role]
  );
  const canEdit = effectiveRole === "owner" || effectiveRole === "admin";

  const [includeInactive, setIncludeInactive] = useState(true);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [mode, setMode] = useState("create"); // create | edit
  const [editingId, setEditingId] = useState(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [hourlyRate, setHourlyRate] = useState("");

  function resetForm() {
    setMode("create");
    setEditingId(null);
    setName("");
    setDescription("");
    setCurrencyCode("USD");
    setHourlyRate("");
    setErrorMsg("");
  }

  function startEdit(r) {
    setMode("edit");
    setEditingId(r.id);
    setName(r.name || "");
    setDescription(r.description || "");
    setCurrencyCode(r.currency_code || "USD");
    setHourlyRate(r.hourly_rate == null ? "" : String(r.hourly_rate));
  }

  async function load() {
    if (!currentOrg?.id) return;

    setLoadingList(true);
    setErrorMsg("");
    try {
      const orgId = currentOrg.id;

      let q = supabase
        .from(TABLE)
        .select(
          "id, tenant_id, org_id, name, description, active, hourly_rate, currency_code, created_at, created_by"
        )
        .or(`tenant_id.eq.${orgId},org_id.eq.${orgId}`)
        .order("created_at", { ascending: false });

      if (!includeInactive) q = q.eq("active", true);

      const { data, error } = await q;
      if (error) throw error;

      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("[ActividadesPage] load error", e);
      setRows([]);
      setErrorMsg(
        e?.message ||
          t("actividades.errorLoad", { defaultValue: "No se pudo cargar actividades." })
      );
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    if (!loading && isAuthenticated && currentOrg?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAuthenticated, currentOrg?.id, includeInactive]);

  async function onSubmit(e) {
    e.preventDefault();
    setErrorMsg("");

    if (!canEdit) {
      setErrorMsg(
        t("actividades.readOnlyNote", {
          defaultValue: "No tienes permisos para editar actividades.",
        })
      );
      return;
    }

    if (!name.trim()) {
      setErrorMsg(
        t("actividades.errorNameRequired", { defaultValue: "El nombre es obligatorio." })
      );
      return;
    }

    const rate = toNumber(hourlyRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      setErrorMsg(
        t("actividades.errorRatePositive", {
          defaultValue: "La tarifa por hora debe ser un número mayor a 0.",
        })
      );
      return;
    }

    setBusy(true);
    try {
      const orgId = currentOrg.id;

      if (mode === "create") {
        const payload = {
          tenant_id: orgId, // ✅ NOT NULL
          org_id: orgId, // ✅ tu RLS suele mirar org_id
          name: name.trim(),
          description: description.trim() || null,
          active: true,
          hourly_rate: rate,
          currency_code: currencyCode,
          created_by: user?.id ?? null,
        };

        const { error } = await supabase.from(TABLE).insert([payload]);
        if (error) throw error;
      } else if (editingId) {
        const payload = {
          name: name.trim(),
          description: description.trim() || null,
          hourly_rate: rate,
          currency_code: currencyCode,
        };

        const { error } = await supabase
          .from(TABLE)
          .update(payload)
          .eq("id", editingId)
          .or(`tenant_id.eq.${orgId},org_id.eq.${orgId}`);

        if (error) throw error;
      }

      resetForm();
      await load();
    } catch (e) {
      console.error("[ActividadesPage] save error", e);
      setErrorMsg(
        e?.message || t("actividades.errorSave", { defaultValue: "No se pudo guardar." })
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(id, nextActive) {
    if (!canEdit) return;
    setErrorMsg("");
    try {
      const orgId = currentOrg.id;
      const { error } = await supabase
        .from(TABLE)
        .update({ active: !!nextActive })
        .eq("id", id)
        .or(`tenant_id.eq.${orgId},org_id.eq.${orgId}`);
      if (error) throw error;
      await load();
    } catch (e) {
      console.error("[ActividadesPage] toggle error", e);
      setErrorMsg(
        e?.message || t("actividades.errorToggle", { defaultValue: "No se pudo actualizar." })
      );
    }
  }

  async function deleteOne(id) {
    if (!canEdit) return;

    const ok = window.confirm(
      t("actividades.confirmDeleteGeneric", { defaultValue: "¿Eliminar esta actividad?" })
    );
    if (!ok) return;

    setErrorMsg("");
    try {
      const orgId = currentOrg.id;
      const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq("id", id)
        .or(`tenant_id.eq.${orgId},org_id.eq.${orgId}`);
      if (error) throw error;
      await load();
    } catch (e) {
      console.error("[ActividadesPage] delete error", e);
      setErrorMsg(
        e?.message || t("actividades.errorDelete", { defaultValue: "No se pudo eliminar." })
      );
    }
  }

  // --- UI estados ---
  if (loading) {
    return (
      <div className="p-4 max-w-5xl mx-auto">
        <div className="border rounded px-4 py-3 text-sm text-gray-600">
          {t("common.actions.loading", { defaultValue: "Cargando…" })}
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <div className="border rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("auth.loginRequired", { defaultValue: "Debes iniciar sesión." })}
        </div>
      </div>
    );
  }

  if (!currentOrg?.id) {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <div className="border rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("actividades.errorMissingTenant", { defaultValue: "No hay organización activa." })}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold mb-4">
          {t("actividades.title", { defaultValue: "Actividades" })}
        </h1>

        <div className="text-xs text-gray-600 text-right">
          <div className="font-mono">{currentOrg.id}</div>
          <div>{(effectiveRole || t("common.loading", { defaultValue: "cargando" })).toUpperCase()}</div>
        </div>
      </div>

      {!canEdit && (
        <div className="mb-4 border rounded bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          {t("actividades.readOnlyNote", {
            defaultValue:
              "Solo el propietario y los administradores pueden crear o modificar actividades.",
          })}
        </div>
      )}

      {errorMsg && (
        <div className="mb-4 border rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="mb-4 flex items-center gap-2">
        <input
          id="inc-inact"
          type="checkbox"
          checked={includeInactive}
          onChange={(e) => setIncludeInactive(e.target.checked)}
        />
        <label htmlFor="inc-inact" className="text-sm text-gray-700">
          {t("actividades.includeInactive", { defaultValue: "Incluir inactivas" })}
        </label>
      </div>

      {canEdit && (
        <form onSubmit={onSubmit} className="border rounded p-4 mb-6 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="border rounded px-3 py-2"
              placeholder={t("actividades.fieldNamePlaceholder", {
                defaultValue: "Nombre de la actividad",
              })}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <input
              className="border rounded px-3 py-2"
              placeholder={t("actividades.fieldHourlyRatePlaceholder", {
                defaultValue: "Tarifa por hora (ej. 3.50)",
              })}
              type="number"
              step="0.01"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
            />

            <select
              className="border rounded px-3 py-2"
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
              aria-label={t("actividades.fieldCurrency", { defaultValue: "Moneda" })}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {t(`actividades.currencies.${c}`, { defaultValue: c })}
                </option>
              ))}
            </select>

            <input
              className="border rounded px-3 py-2"
              placeholder={t("actividades.fieldDescriptionPlaceholder", {
                defaultValue: "Descripción (opcional)",
              })}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="mt-3 flex gap-2">
            <button
              disabled={busy}
              className="px-4 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-60"
            >
              {mode === "create"
                ? t("actividades.buttonCreate", { defaultValue: "Crear" })
                : t("actividades.buttonSave", { defaultValue: "Guardar" })}
            </button>

            {mode === "edit" && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded bg-gray-300 text-sm"
                disabled={busy}
              >
                {t("actividades.buttonCancel", { defaultValue: "Cancelar" })}
              </button>
            )}
          </div>
        </form>
      )}

      {loadingList ? (
        <div className="border rounded px-4 py-3 text-sm text-gray-600">
          {t("actividades.loading", { defaultValue: "Cargando actividades…" })}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.length === 0 && (
            <div className="text-sm text-gray-500">
              {t("actividades.empty", { defaultValue: "No hay actividades registradas." })}
            </div>
          )}

          {rows.map((a) => (
            <div key={a.id} className="border rounded p-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">{a.name}</div>

                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-gray-800 font-medium">
                    {(a.currency_code || "USD")} · {a.hourly_rate ?? ""}
                  </span>

                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      a.active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {a.active
                      ? t("actividades.statusActive", { defaultValue: "Activa" })
                      : t("actividades.statusInactive", { defaultValue: "Inactiva" })}
                  </span>
                </div>

                {a.description && <div className="mt-1 text-sm text-gray-700">{a.description}</div>}
              </div>

              {canEdit && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(a)}
                    className="text-xs px-2 py-1 rounded bg-yellow-500 text-white"
                  >
                    {t("common.actions.edit", { defaultValue: "Editar" })}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleActive(a.id, !a.active)}
                    className="text-xs px-2 py-1 rounded bg-blue-500 text-white"
                  >
                    {a.active
                      ? t("actividades.actionDeactivate", { defaultValue: "Desactivar" })
                      : t("actividades.actionActivate", { defaultValue: "Activar" })}
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteOne(a.id)}
                    className="text-xs px-2 py-1 rounded bg-red-600 text-white"
                  >
                    {t("common.actions.delete", { defaultValue: "Eliminar" })}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
