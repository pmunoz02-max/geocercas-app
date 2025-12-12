// src/help/FaqPage.jsx
import React, { useMemo, useState } from "react";

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-5 py-4 flex items-start justify-between gap-4"
        aria-expanded={open ? "true" : "false"}
      >
        <div className="text-sm font-semibold text-slate-900">{q}</div>
        <div
          className={
            open
              ? "mt-0.5 shrink-0 h-6 w-6 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm font-bold"
              : "mt-0.5 shrink-0 h-6 w-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-bold"
          }
        >
          {open ? "–" : "+"}
        </div>
      </button>

      {open ? (
        <div className="px-5 pb-4 text-sm text-slate-600">
          <div className="border-t border-slate-100 pt-3">{a}</div>
        </div>
      ) : null}
    </div>
  );
}

export default function FaqPage() {
  const sections = useMemo(
    () => [
      {
        title: "Cuenta, organizaciones y roles",
        items: [
          {
            q: "¿Qué es una organización?",
            a: "Es el contenedor principal de datos en App Geocercas. Dentro de una organización se guardan geocercas, personal, actividades, asignaciones, reportes y costos. Cada organización está aislada (multi-tenant).",
          },
          {
            q: "¿Cuál es la diferencia entre Propietario (owner), Admin y Tracker?",
            a: "Owner: control total de la organización, puede administrar todo e invitar usuarios. Admin: gestiona módulos administrativos según permisos. Tracker: usa la app para enviar ubicación; no gestiona datos administrativos.",
          },
          {
            q: "¿Puedo tener más de una organización con el mismo usuario?",
            a: "Sí. El sistema está preparado para multi-organización. Tu organización activa define qué datos ves y qué permisos aplican en ese momento.",
          },
        ],
      },
      {
        title: "Geocercas",
        items: [
          {
            q: "¿Qué tipos de geocercas puedo usar?",
            a: "Puedes trabajar con zonas tipo polígono (recomendado para áreas reales) y zonas por radio/centro (útil para puntos específicos).",
          },
          {
            q: "¿Por qué mi geocerca no marca entradas/salidas como espero?",
            a: "Las causas más comunes son: geocerca demasiado grande, GPS con baja precisión, intervalos de registro muy largos o permisos de ubicación limitados. Ajusta el polígono y revisa permisos del tracker.",
          },
          {
            q: "¿Cuántas geocercas puedo crear?",
            a: "Depende del plan. En el plan gratuito se recomienda limitar la cantidad para mantener rendimiento. En planes PRO se habilitan más geocercas y herramientas avanzadas.",
          },
        ],
      },
      {
        title: "Tracker (GPS) y modo offline",
        items: [
          {
            q: "¿Funciona sin internet?",
            a: "Sí. El tracker puede guardar registros localmente cuando no hay señal y sincronizar cuando la conexión vuelve. Esto evita pérdida de datos en campo.",
          },
          {
            q: "¿Consume mucha batería?",
            a: "Depende de la frecuencia de lectura y del dispositivo. Recomendación: usar intervalos razonables, permitir ubicación en segundo plano y desactivar optimizaciones agresivas de batería para la app.",
          },
          {
            q: "¿Qué permisos debo activar en el móvil?",
            a: "Ubicación precisa y, de ser posible, ubicación en segundo plano. Sin esos permisos, los registros pueden ser incompletos o intermitentes.",
          },
        ],
      },
      {
        title: "Asignaciones, horas y costos",
        items: [
          {
            q: "¿Cómo se calcula el tiempo trabajado?",
            a: "En base a los registros del tracker (entradas/salidas o permanencias en geocercas) y las asignaciones activas: Persona + Actividad + Geocerca.",
          },
          {
            q: "¿Cómo se calcula el costo?",
            a: "Cada actividad puede tener tarifa por hora y moneda. El sistema multiplica horas registradas por tarifa y genera reportes y dashboards.",
          },
          {
            q: "¿Puedo manejar múltiples monedas?",
            a: "Sí. Puedes definir actividades con moneda y ver resúmenes por moneda en reportes/dashboard (según la configuración del módulo).",
          },
        ],
      },
      {
        title: "Seguridad y privacidad",
        items: [
          {
            q: "¿Quién puede ver la ubicación de un tracker?",
            a: "Solo usuarios con permisos dentro de la misma organización (owner/admin) según el módulo correspondiente. Los datos están aislados por organización.",
          },
          {
            q: "¿Los trackers ven información administrativa?",
            a: "No. El rol tracker está pensado para operación en campo y no debe acceder a reportes/costos/administración.",
          },
        ],
      },
      {
        title: "Planes y soporte",
        items: [
          {
            q: "¿Habrá plan PRO?",
            a: "Sí. La idea del plan PRO es habilitar más geocercas, más reportes, automatizaciones, soporte prioritario y funciones avanzadas (alertas, exportaciones, auditoría).",
          },
          {
            q: "¿Cómo contacto soporte?",
            a: "Desde el Centro de ayuda (tarjeta Soporte). También puedes registrar incidencias indicando: organización, módulo, pasos para reproducir y captura de pantalla.",
          },
        ],
      },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            AYUDA
          </div>

          <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
                Preguntas frecuentes
              </h1>
              <p className="mt-2 max-w-2xl text-slate-600">
                Respuestas rápidas sobre organizaciones, geocercas, tracker, costos y permisos.
              </p>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <a
                href="/help/instructions"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                Ver guía rápida
              </a>
              <a
                href="/inicio"
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                Volver al panel
              </a>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          {sections.map((sec) => (
            <div key={sec.title} className="space-y-3">
              <div className="text-sm font-bold text-slate-800">{sec.title}</div>
              <div className="space-y-3">
                {sec.items.map((it) => (
                  <FaqItem key={it.q} q={it.q} a={it.a} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 text-xs text-slate-500">
          Nota: Esta página está lista para i18n (ES/EN/FR) en el siguiente paso, si quieres.
        </div>
      </div>
    </div>
  );
}
