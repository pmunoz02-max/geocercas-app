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

// Fallback razonable de locale sin depender del i18n
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
    return `${currency || "USD"} ${n.toFixed(2)}`;
  }
}

export default function ActividadesPage() {
  const { ready, activeOrgId, role, currentRole } = useAuth();
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

  useEffect(() => {
    setActividades([]);
    setErrorMsg("");
    resetForm();
  }, [activeOrgId]);

  const inputClass =
    "border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const selectClass =
    "border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

  async function loadActividades() {
    if (!activeOrgId) {
      setActividades([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg("");
    try {
      const data = await listActividades({ includeInactive: true, orgId: activeOrgId });
      setActividades(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("[ActividadesPage] load error:", err);
      setErrorMsg(
        err?.message ||
          t("actividades.errorLoad", {
            defaultValue: "No se pudieron cargar las actividades.",
          })
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ready && activeOrgId) loadActividades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, activeOrgId]);

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
      a.hourly_rate == null || Number.isNaN(Number(a.hourly_rate))
        ? ""
        : String(a.hourly_rate)
    );
    setErrorMsg("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");

    const cleanName = nombre.trim();
    const cleanDescription = descripcion.trim() || null;
    const parsedHourlyRate = Number(hourlyRate);

    if (!cleanName) {
      setErrorMsg(
        t("actividades.errorNameRequired", {
          defaultValue: "El nombre es obligatorio.",
        })
      );
      return;
    }

    if (!hourlyRate || !Number.isFinite(parsedHourlyRate)) {
      setErrorMsg(
        t("actividades.errorRateInvalid", {
          defaultValue: "Ingresa un costo por hora válido.",
        })
      );
      return;
    }

    if (parsedHourlyRate <= 0) {
      setErrorMsg(
        t("actividades.errorRatePositive", {
          defaultValue: "El costo por hora debe ser mayor que 0.",
        })
      );
      return;
    }

    try {
      if (formMode === "create") {
        await createActividad(
          {
            name: cleanName,
            description: cleanDescription,
            active: true,
            currency,
            hourly_cost: parsedHourlyRate,
          },
          { orgId: activeOrgId }
        );
      } else if (editingId) {
        await updateActividad(
          editingId,
          {
            name: cleanName,
            description: cleanDescription,
            currency,
            hourly_cost: parsedHourlyRate,
          },
          { orgId: activeOrgId }
        );
      }

      resetForm();
      await loadActividades();
    } catch (err) {
      console.error("[ActividadesPage] save error:", err);
      setErrorMsg(
        err?.message ||
          t("actividades.errorSave", {
            defaultValue: "No se pudo guardar la actividad.",
          })
      );
    }
  }

  async function handleToggle(a) {
    if (!activeOrgId) {
      setErrorMsg(
        t("actividades.errorMissingTenant", {
          defaultValue: "No hay una organización activa.",
        })
      );
      return;
    }

    try {
      setErrorMsg("");
      await toggleActividadActiva(a.id, !a.active, { orgId: activeOrgId });
      await loadActividades();
    } catch (err) {
      console.error("[ActividadesPage] toggle error:", err);
      setErrorMsg(
        err?.message ||
          t("actividades.errorSave", {
            defaultValue: "No se pudo actualizar la actividad.",
          })
      );
    }
  }

  async function handleDelete(a) {
    if (!activeOrgId) {
      setErrorMsg(
        t("actividades.errorMissingTenant", {
          defaultValue: "No hay una organización activa.",
        })
      );
      return;
    }

    const ok = window.confirm(
      t("actividades.confirmDelete", {
        defaultValue: `¿Eliminar la actividad "${a.name}"?`,
      })
    );
    if (!ok) return;

    try {
      setErrorMsg("");
      await deleteActividad(a.id, { orgId: activeOrgId });
      await loadActividades();
    } catch (err) {
      console.error("[ActividadesPage] delete error:", err);
      setErrorMsg(
        err?.message ||
          t("actividades.errorSave", {
            defaultValue: "No se pudo eliminar la actividad.",
          })
      );
    }
  }

  const sortedActividades = useMemo(() => {
    const arr = Array.isArray(actividades) ? [...actividades] : [];
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
          {t("common.actions.loading", {
            defaultValue: "Cargando...",
          })}
        </div>
      </div>
    );
  }

  if (!activeOrgId) {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <div className="border rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("actividades.errorMissingTenant", {
            defaultValue: "No hay una organización activa.",
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {t("actividades.title", { defaultValue: "Actividades" })}
          </h1>
          <div className="text-sm text-gray-600 mt-1">
            {t("actividades.subtitle", {
              defaultValue: "Catálogo de actividades con costo por hora.",
            })}
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 border rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {canEdit && (
        <form onSubmit={handleSubmit} className="border rounded-xl p-4 mb-6 bg-white shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-800">
                {t("actividades.fieldNameLabel", { defaultValue: "Nombre" })}
              </label>
              <input
                className={inputClass}
                placeholder={t("actividades.fieldNamePlaceholder", {
                  defaultValue: "Ej. Siembra, Riego, Cosecha",
                })}
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
                placeholder={t("actividades.fieldHourlyRatePlaceholder", {
                  defaultValue: "Ej. 3.50",
                })}
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-800">
                {t("actividades.fieldCurrencyLabel", { defaultValue: "Moneda" })}
              </label>
              <select
                className={selectClass}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {t(`actividades.currencies.${c.code}`, { defaultValue: c.code })}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-800">
                {t("actividades.fieldDescriptionLabel", {
                  defaultValue: "Descripción (opcional)",
                })}
              </label>
              <input
                className={inputClass}
                placeholder={t("actividades.fieldDescriptionPlaceholder", {
                  defaultValue: "Descripción breve de la actividad...",
                })}
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
              {formMode === "create"
                ? t("actividades.buttonCreate", { defaultValue: "Crear actividad" })
                : t("actividades.buttonSave", { defaultValue: "Guardar cambios" })}
            </button>

            {formMode === "edit" && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-sm font-medium"
              >
                {t("actividades.buttonCancel", { defaultValue: "Cancelar" })}
              </button>
            )}
          </div>
        </form>
      )}

      {loading ? (
        <div className="border rounded-lg px-4 py-3 text-sm text-gray-700 bg-white">
          {t("actividades.loading", { defaultValue: "Cargando actividades..." })}
        </div>
      ) : (
        <div className="space-y-3">
          {sortedActividades.length === 0 && (
            <div className="text-sm text-gray-600">
              {t("actividades.empty", { defaultValue: "No hay actividades registradas." })}
            </div>
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

                    <span
                      className={[
                        "text-xs font-semibold px-2 py-1 rounded-full border",
                        isActive
                          ? "bg-green-50 text-green-800 border-green-200"
                          : "bg-gray-100 text-gray-700 border-gray-200",
                      ].join(" ")}
                      title={
                        isActive
                          ? t("actividades.statusActive", { defaultValue: "Activa" })
                          : t("actividades.statusInactive", { defaultValue: "Inactiva" })
                      }
                    >
                      {isActive
                        ? t("actividades.statusActive", { defaultValue: "Activa" })
                        : t("actividades.statusInactive", { defaultValue: "Inactiva" })}
                    </span>
                  </div>

                  <div className="mt-1 text-sm text-gray-700">
                    <span className="font-medium">
                      {money || `${a.currency_code || "USD"} ${a.hourly_rate ?? ""}`}
                    </span>
                    <span className="mx-2 text-gray-400">|</span>
                    <span className="text-gray-700">
                      {t("actividades.ratePerHour", { defaultValue: "por hora" })}
                    </span>
                    <span className="mx-2 text-gray-400">|</span>
                    <span className="text-gray-700">
                      {(a.currency_code || "USD").toUpperCase()}
                    </span>
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
                      {t("actividades.actionEdit", { defaultValue: "Editar" })}
                    </button>

                    <button
                      onClick={() => handleToggle(a)}
                      className="text-sm px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
                      type="button"
                    >
                      {a.active
                        ? t("actividades.actionDeactivate", { defaultValue: "Desactivar" })
                        : t("actividades.actionActivate", { defaultValue: "Activar" })}
                    </button>

                    <button
                      onClick={() => handleDelete(a)}
                      className="text-sm px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium"
                      type="button"
                    >
                      {t("actividades.actionDelete", { defaultValue: "Eliminar" })}
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