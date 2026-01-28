// src/pages/ActividadesPage.jsx
// Gestión de catálogo de actividades (con costos) por organización
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";

// ⚠️ Ajusta si tu tabla se llama diferente
const TABLE = "activities";

// Lista de monedas (puedes ampliar a ISO-4217 después)
const CURRENCIES = [
  "USD","EUR","MXN","COP","PEN","CLP","ARS","BRL","CAD","GBP"
].map((code) => ({ code }));

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export default function ActividadesPage() {
  const { ready, currentOrg, role, currentRole } = useAuth();
  const { t } = useTranslation();

  const effectiveRole = useMemo(
    () => (currentRole || role || "").toLowerCase(),
    [currentRole, role]
  );
  const canEdit = effectiveRole === "owner" || effectiveRole === "admin";

  const [includeInactive, setIncludeInactive] = useState(true);
  const [actividades, setActividades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busySave, setBusySave] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [formMode, setFormMode] = useState("create"); // create | edit
  const [editingId, setEditingId] = useState(null);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [hourlyRate, setHourlyRate] = useState("");

  function resetForm() {
    setFormMode("create");
    setEditingId(null);
    setNombre("");
    setDescripcion("");
    setCurrency("USD");
    setHourlyRate("");
    setErrorMsg("");
  }

  function startEdit(a) {
    setFormMode("edit");
    setEditingId(a.id);
    setNombre(a.name || "");
    setDescripcion(a.description || "");
    setCurrency(a.currency_code || "USD");
    setHourlyRate(
      a.hourly_rate === null || a.hourly_rate === undefined ? "" : String(a.hourly_rate)
    );
  }

  async function loadActividades() {
    if (!currentOrg?.id) return;
    setLoading(true);
    setErrorMsg("");

    try {
      let q = supabase
        .from(TABLE)
        .select("id, org_id, name, description, active, currency_code, hourly_rate, created_at")
        .eq("org_id", currentOrg.id)
        .order("created_at", { ascending: false });

      if (!includeInactive) q = q.eq("active", true);

      const { data, error } = await q;
      if (error) throw error;

      setActividades(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("[ActividadesPage] load error:", err);
      setErrorMsg(err?.message || t("actividades.errorLoad"));
      setActividades([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ready && currentOrg?.id) loadActividades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, currentOrg?.id, includeInactive]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");

    if (!canEdit) {
      setErrorMsg("No tienes permisos para editar actividades.");
      return;
    }

    if (!nombre.trim()) {
      setErrorMsg(t("actividades.errorNameRequired"));
      return;
    }

    const rate = toNumber(hourlyRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      setErrorMsg(t("actividades.errorRatePositive"));
      return;
    }

    setBusySave(true);
    try {
      if (formMode === "create") {
        const payload = {
          org_id: currentOrg.id, // ✅ crítico para multi-tenant + RLS
          name: nombre.trim(),
          description: descripcion.trim() || null,
          active: true,
          currency_code: currency,
          hourly_rate: rate,
        };

        const { error } = await supabase.from(TABLE).insert([payload]);
        if (error) throw error;
      } else if (editingId) {
        const payload = {
          name: nombre.trim(),
          description: descripcion.trim() || null,
          currency_code: currency,
          hourly_rate: rate,
        };

        // ✅ siempre aseguramos org_id para evitar tocar otra org por accidente
        const { error } = await supabase
          .from(TABLE)
          .update(payload)
          .eq("id", editingId)
          .eq("org_id", currentOrg.id);

        if (error) throw error;
      }

      resetForm();
      await loadActividades();
    } catch (err) {
      console.error("[ActividadesPage] save error:", err);
      setErrorMsg(err?.message || t("actividades.errorSave"));
    } finally {
      setBusySave(false);
    }
  }

  async function toggleActiva(id, nextActive) {
    if (!canEdit) return;
    setErrorMsg("");
    try {
      const { error } = await supabase
        .from(TABLE)
        .update({ active: !!nextActive })
        .eq("id", id)
        .eq("org_id", currentOrg.id);
      if (error) throw error;
      await loadActividades();
    } catch (err) {
      console.error("[ActividadesPage] toggle error:", err);
      setErrorMsg(err?.message || t("actividades.errorSave"));
    }
  }

  async function deleteOne(id) {
    if (!canEdit) return;
    const ok = window.confirm(t("actividades.confirmDelete", { defaultValue: "¿Eliminar esta actividad?" }));
    if (!ok) return;

    setErrorMsg("");
    try {
      const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq("id", id)
        .eq("org_id", currentOrg.id);
      if (error) throw error;
      await loadActividades();
    } catch (err) {
      console.error("[ActividadesPage] delete error:", err);
      setErrorMsg(err?.message || t("actividades.errorSave"));
    }
  }

  if (!ready) {
    return (
      <div className="p-4 max-w-5xl mx-auto">
        <div className="border rounded px-4 py-3 text-sm text-gray-600">
          {t("common.actions.loading")}
        </div>
      </div>
    );
  }

  if (!currentOrg?.id) {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <div className="border rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("actividades.errorMissingTenant")}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold mb-4">{t("actividades.title")}</h1>

        <div className="text-xs text-gray-600 text-right">
          <div className="font-mono">{currentOrg.id}</div>
          <div>{(effectiveRole || "cargando").toUpperCase()}</div>
        </div>
      </div>

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

      {/* FORMULARIO */}
      {canEdit && (
        <form onSubmit={handleSubmit} className="border rounded p-4 mb-6 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="border rounded px-3 py-2"
              placeholder={t("actividades.fieldNamePlaceholder")}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />

            <input
              className="border rounded px-3 py-2"
              placeholder={t("actividades.fieldHourlyRatePlaceholder")}
              type="number"
              step="0.01"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
            />

            <select
              className="border rounded px-3 py-2"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {t(`actividades.currencies.${c.code}`, { defaultValue: c.code })}
                </option>
              ))}
            </select>

            <input
              className="border rounded px-3 py-2"
              placeholder={t("actividades.fieldDescriptionPlaceholder")}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>

          <div className="mt-3 flex gap-2">
            <button
              disabled={busySave}
              className="px-4 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-60"
            >
              {formMode === "create"
                ? t("actividades.buttonCreate")
                : t("actividades.buttonSave")}
            </button>

            {formMode === "edit" && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded bg-gray-300 text-sm"
                disabled={busySave}
              >
                {t("actividades.buttonCancel")}
              </button>
            )}
          </div>
        </form>
      )}

      {/* LISTA */}
      {loading ? (
        <div className="border rounded px-4 py-3 text-sm text-gray-600">
          {t("actividades.loading")}
        </div>
      ) : (
        <div className="space-y-2">
          {actividades.length === 0 && (
            <div className="text-sm text-gray-500">{t("actividades.empty")}</div>
          )}

          {actividades.map((a) => (
            <div key={a.id} className="border rounded p-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">{a.name}</div>

                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-gray-800 font-medium">
                    {a.currency_code} · {a.hourly_rate}
                  </span>

                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      a.active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {a.active ? t("actividades.statusActive") : t("actividades.statusInactive")}
                  </span>
                </div>

                {a.description && (
                  <div className="mt-1 text-sm text-gray-700">{a.description}</div>
                )}
              </div>

              {canEdit && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(a)}
                    className="text-xs px-2 py-1 rounded bg-yellow-500 text-white"
                  >
                    {t("actividades.actionEdit")}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleActiva(a.id, !a.active)}
                    className="text-xs px-2 py-1 rounded bg-blue-500 text-white"
                  >
                    {a.active ? t("actividades.actionDeactivate") : t("actividades.actionActivate")}
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteOne(a.id)}
                    className="text-xs px-2 py-1 rounded bg-red-600 text-white"
                  >
                    {t("actividades.actionDelete")}
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
