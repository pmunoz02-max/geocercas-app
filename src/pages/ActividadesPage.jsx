// src/pages/ActividadesPage.jsx
// Gestión de catálogo de actividades (con costos) por organización

import { useEffect, useMemo, useState } from "react";
import {
  listActividades,
  createActividad,
  updateActividad,
  toggleActividadActiva,
  deleteActividad,
} from "../lib/actividadesApi";

import { useAuth } from "@/context/auth.js";
import { useTranslation } from "react-i18next";

// Lista de monedas
const CURRENCIES = [
  { code: "USD" },
  { code: "EUR" },
  { code: "MXN" },
  { code: "COP" },
  { code: "PEN" },
  { code: "CLP" },
  { code: "ARS" },
  { code: "BRL" },
  { code: "CAD" },
  { code: "GBP" },
];

// Fallback razonable de locale sin depender del i18n (evita romper si no está config)
// Puedes ajustar luego si quieres: "es-EC", "es", etc.
function getSafeLocale() {
  try {
    if (typeof navigator !== "undefined" && navigator.language) return navigator.language;
  } catch (_) {}
  return "es-EC";
}

// Formateo de dinero universal
function formatMoney(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  const locale = getSafeLocale();
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch (_) {
    // fallback si currency es inválida
    return `${currency || "USD"} ${n.toFixed(2)}`;
  }
}

export default function ActividadesPage() {
  const { ready, currentOrg, role, currentRole } = useAuth();
  const { t } = useTranslation();

  const effectiveRole = (currentRole || role || "").toLowerCase();
  const canEdit = effectiveRole === "owner" || effectiveRole === "admin";

  const [actividades, setActividades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [formMode, setFormMode] = useState("create");
  const [editingId, setEditingId] = useState(null);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [hourlyRate, setHourlyRate] = useState("");

  // ✅ Estilos de inputs con alto contraste (universal dentro de esta pantalla)
  const inputClass =
    "border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const selectClass =
    "border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

  async function loadActividades() {
    setLoading(true);
    setErrorMsg("");
    try {
      const data = await listActividades({ includeInactive: true });
      setActividades(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("[ActividadesPage] load error:", err);
      setErrorMsg(err?.message || t("actividades.errorLoad"));
    }
    setLoading(false);
  }

  useEffect(() => {
    if (ready && currentOrg) loadActividades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, currentOrg?.id]);

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
    setHourlyRate(a.hourly_rate ?? "");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");

    if (!nombre.trim()) {
      setErrorMsg(t("actividades.errorNameRequired"));
      return;
    }

    if (!hourlyRate || Number(hourlyRate) <= 0) {
      setErrorMsg(t("actividades.errorRatePositive"));
      return;
    }

    try {
      if (formMode === "create") {
        await createActividad({
          name: nombre.trim(),
          description: descripcion.trim() || null,
          active: true,
          currency_code: currency,
          hourly_rate: Number(hourlyRate),
        });
      } else if (editingId) {
        await updateActividad(editingId, {
          name: nombre.trim(),
          description: descripcion.trim() || null,
          currency_code: currency,
          hourly_rate: Number(hourlyRate),
        });
      }

      resetForm();
      await loadActividades();
    } catch (err) {
      console.error("[ActividadesPage] save error:", err);
      setErrorMsg(err?.message || t("actividades.errorSave"));
    }
  }

  const sortedActividades = useMemo(() => {
    const arr = Array.isArray(actividades) ? [...actividades] : [];
    // Activas primero, luego por nombre
    return arr.sort((a, b) => {
      const aa = a?.active ? 0 : 1;
      const bb = b?.active ? 0 : 1;
      if (aa !== bb) return aa - bb;
      return String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
        sensitivity: "base",
      });
    });
  }, [actividades]);

  if (!ready) {
    return (
      <div className="p-4 max-w-5xl mx-auto">
        <div className="border rounded-lg px-4 py-3 text-sm text-gray-700 bg-white">
          {t("common.actions.loading")}
        </div>
      </div>
    );
  }

  if (!currentOrg) {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <div className="border rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("actividades.errorMissingTenant")}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("actividades.title")}</h1>
          <div className="text-sm text-gray-600 mt-1">
            {t("actividades.subtitle", { defaultValue: "Catálogo de actividades con costo por hora." })}
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 border rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* FORMULARIO */}
      {canEdit && (
        <form onSubmit={handleSubmit} className="border rounded-xl p-4 mb-6 bg-white shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-800">
                {t("actividades.fieldNameLabel", { defaultValue: "Nombre" })}
              </label>
              <input
                className={inputClass}
                placeholder={t("actividades.fieldNamePlaceholder")}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-800">
                {t("actividades.fieldHourlyRateLabel", { defaultValue: "Costo por hora" })}
              </label>
              <input
                className={inputClass}
                placeholder={t("actividades.fieldHourlyRatePlaceholder")}
                type="number"
                inputMode="decimal"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-800">
                {t("actividades.fieldCurrencyLabel", { defaultValue: "Moneda" })}
              </label>
              <select className={selectClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {t(`actividades.currencies.${c.code}`, { defaultValue: c.code })}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-800">
                {t("actividades.fieldDescriptionLabel", { defaultValue: "Descripción (opcional)" })}
              </label>
              <input
                className={inputClass}
                placeholder={t("actividades.fieldDescriptionPlaceholder")}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
              type="submit"
            >
              {formMode === "create" ? t("actividades.buttonCreate") : t("actividades.buttonSave")}
            </button>

            {formMode === "edit" && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-sm font-medium"
              >
                {t("actividades.buttonCancel")}
              </button>
            )}
          </div>
        </form>
      )}

      {/* LISTA */}
      {loading ? (
        <div className="border rounded-lg px-4 py-3 text-sm text-gray-700 bg-white">
          {t("actividades.loading")}
        </div>
      ) : (
        <div className="space-y-3">
          {sortedActividades.length === 0 && (
            <div className="text-sm text-gray-600">{t("actividades.empty")}</div>
          )}

          {sortedActividades.map((a) => {
            const isActive = !!a.active;
            const money = formatMoney(a.hourly_rate, a.currency_code);

            return (
              <div
                key={a.id}
                className={[
                  "border rounded-xl p-4 bg-white shadow-sm",
                  "flex flex-col md:flex-row md:items-center md:justify-between gap-3",
                  isActive ? "border-gray-200" : "border-gray-200 opacity-80",
                ].join(" ")}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-base md:text-lg font-semibold text-gray-900 truncate">
                      {a.name}
                    </div>

                    {/* Badge estado */}
                    <span
                      className={[
                        "text-xs font-semibold px-2 py-1 rounded-full border",
                        isActive
                          ? "bg-green-50 text-green-800 border-green-200"
                          : "bg-gray-100 text-gray-700 border-gray-200",
                      ].join(" ")}
                      title={isActive ? t("actividades.statusActive") : t("actividades.statusInactive")}
                    >
                      {isActive ? t("actividades.statusActive") : t("actividades.statusInactive")}
                    </span>
                  </div>

                  {/* Meta (más legible y sin caracteres raros) */}
                  <div className="mt-1 text-sm text-gray-700">
                    <span className="font-medium">{money || `${a.currency_code || "USD"} ${a.hourly_rate ?? ""}`}</span>
                    <span className="mx-2 text-gray-400">|</span>
                    <span className="text-gray-700">{t("actividades.ratePerHour", { defaultValue: "por hora" })}</span>
                    <span className="mx-2 text-gray-400">|</span>
                    <span className="text-gray-700">{(a.currency_code || "USD").toUpperCase()}</span>
                  </div>

                  {a.description && (
                    <div className="mt-2 text-sm text-gray-700 break-words">
                      {a.description}
                    </div>
                  )}
                </div>

                {canEdit && (
                  <div className="flex gap-2 md:justify-end flex-wrap">
                    <button
                      onClick={() => startEdit(a)}
                      className="text-sm px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium"
                      type="button"
                    >
                      {t("actividades.actionEdit")}
                    </button>

                    <button
                      onClick={() => toggleActividadActiva(a.id, !a.active).then(loadActividades)}
                      className="text-sm px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
                      type="button"
                    >
                      {a.active ? t("actividades.actionDeactivate") : t("actividades.actionActivate")}
                    </button>

                    <button
                      onClick={() => deleteActividad(a.id).then(loadActividades)}
                      className="text-sm px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium"
                      type="button"
                    >
                      {t("actividades.actionDelete")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}