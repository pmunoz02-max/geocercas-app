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
    "rounded-xl border border-emerald-100 bg-white px-3.5 py-2.5 shadow-sm shadow-emerald-900/5 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const selectClass =
    "rounded-xl border border-emerald-100 bg-white px-3.5 py-2.5 shadow-sm shadow-emerald-900/5 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500";

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
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
        <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm shadow-emerald-950/5">
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
        <div className="border rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("actividades.errorMissingTenant", {
            defaultValue: "No hay una organización activa.",
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">

      <section className="relative overflow-hidden rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-emerald-950 via-emerald-800 to-teal-700 px-5 py-6 text-white shadow-xl shadow-emerald-950/15 md:px-7 md:py-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-lime-200/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50">
              {t("actividades.heroEyebrow", { defaultValue: "Catálogo operativo" })}
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                {t("actividades.title", { defaultValue: "Actividades" })}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/90">
                {t("actividades.subtitle", { defaultValue: "Catálogo de actividades con costo por hora." })}
              </p>
            </div>
          </div>
        </div>
      </section>
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
        <div className="mb-4 border rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {canEdit && (
        <form onSubmit={handleSubmit} className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-lg shadow-emerald-950/5 mb-6">
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
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium"
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
                className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-sm font-medium"
              >
                {t("actividades.buttonCancel", { defaultValue: "Cancelar" })}
              </button>
            )}
          </div>
        </form>
      )}

      {loading ? (
        <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm shadow-emerald-950/5">
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
                  isActive ? "border-emerald-100" : "border-emerald-100 opacity-80",
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
                          : "bg-emerald-50 text-gray-700 border-emerald-100",
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
                      className="text-sm px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-medium"
                      type="button"
                    >
                      {t("actividades.actionEdit", { defaultValue: "Editar" })}
                    </button>

                    <button
                      onClick={() => handleToggle(a)}
                      className="text-sm px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                      type="button"
                    >
                      {a.active
                        ? t("actividades.actionDeactivate", { defaultValue: "Desactivar" })
                        : t("actividades.actionActivate", { defaultValue: "Activar" })}
                    </button>

                    <button
                      onClick={() => handleDelete(a)}
                      className="text-sm px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium"
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