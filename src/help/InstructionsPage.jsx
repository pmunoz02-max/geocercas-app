import React, { useMemo } from "react";

/**
 * InstructionsPage
 * - Página de guía rápida para onboarding (SaaS)
 * - Sin dependencias externas (solo clases tipo Tailwind)
 * - Lista para conectar a una ruta: /help/instructions (o la que uses)
 */
export default function InstructionsPage() {
  const steps = useMemo(
    () => [
      {
        title: "Paso 1: Crear tu organización",
        bullets: [
          "La organización es el contenedor principal de toda tu información.",
          "Define quién es Propietario (control total) y quiénes serán Administradores.",
          "Todo lo que crees (geocercas, personal, reportes) queda dentro de la organización.",
        ],
      },
      {
        title: "Paso 2: Crear geocercas",
        bullets: [
          "Crea zonas reales de trabajo: parcelas, frentes de obra, áreas de seguridad, etc.",
          "Recomendación: polígonos ajustados al área real (evita geocercas gigantes).",
          "Pon nombres claros: “Lote 3 - Cosecha”, “Bodega”, “Entrada principal”…",
        ],
      },
      {
        title: "Paso 3: Registrar personal",
        bullets: [
          "Administrativos: gestionan datos, ven reportes y costos.",
          "Trackers: usan el móvil para registrar ubicación (no ven módulos administrativos).",
          "Mantén nombres consistentes para reportes (ej: Apellido + Nombre).",
        ],
      },
      {
        title: "Paso 4: Crear actividades",
        bullets: [
          "Las actividades representan el tipo de trabajo: Cosecha, Riego, Mantenimiento, Seguridad…",
          "Configura costo por hora y moneda para cálculo automático.",
          "Describe la actividad para que el equipo la entienda igual.",
        ],
      },
      {
        title: "Paso 5: Crear asignaciones",
        bullets: [
          "Una asignación une: Persona + Actividad + Geocerca.",
          "Cuando el tracker entra/sale de una geocerca, se registra el tiempo y se calcula duración.",
          "Esto elimina reportes manuales y reduce errores.",
        ],
      },
      {
        title: "Paso 6: Usar el Tracker (móvil)",
        bullets: [
          "Permite ubicación (idealmente en segundo plano) para registros consistentes.",
          "Funciona sin internet: guarda y luego sincroniza cuando vuelve la señal.",
          "Optimiza consumo: usa intervalos razonables y evita apps que maten procesos.",
        ],
      },
      {
        title: "Paso 7: Ver reportes y costos",
        bullets: [
          "Consulta reportes por persona, actividad, geocerca y rango de fechas.",
          "Verifica horas y costos calculados automáticamente.",
          "Exporta/usa reportes para control interno, auditoría o facturación.",
        ],
      },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            GUÍA RÁPIDA
          </div>

          <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
                Instrucciones
              </h1>
              <p className="mt-2 max-w-2xl text-slate-600">
                Configura App Geocercas desde cero hasta obtener control real del
                personal, actividades y costos mediante geocercas.
              </p>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <a
                href="#pasos"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                Ir a pasos
              </a>
              <a
                href="#resultado"
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                Ver resultado
              </a>
            </div>
          </div>
        </div>

        {/* Contenido */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Índice */}
          <div className="lg:col-span-1">
            <div className="sticky top-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold text-slate-900">Contenido</h2>
              <p className="mt-1 text-sm text-slate-600">
                Navega por los pasos y aplica la guía en tu organización.
              </p>

              <div className="mt-4 space-y-2">
                <a
                  className="block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  href="#pasos"
                >
                  Pasos de configuración
                </a>
                <a
                  className="block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  href="#tips"
                >
                  Buenas prácticas
                </a>
                <a
                  className="block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  href="#resultado"
                >
                  Resultado final
                </a>
              </div>

              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <div className="text-xs font-bold text-slate-700">
                  Recomendación
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Completa los pasos 1 a 5 primero. Después conecta el Tracker y
                  revisa reportes.
                </div>
              </div>
            </div>
          </div>

          {/* Pasos */}
          <div className="lg:col-span-2">
            <div
              id="pasos"
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-extrabold text-slate-900">
                Pasos de configuración
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Sigue el orden sugerido para obtener resultados rápidos.
              </p>

              <div className="mt-5 space-y-4">
                {steps.map((s, idx) => (
                  <div
                    key={s.title}
                    className="rounded-2xl border border-slate-200 p-5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-sm font-extrabold text-emerald-700">
                        {idx + 1}
                      </div>
                      <div className="w-full">
                        <div className="text-base font-bold text-slate-900">
                          {s.title}
                        </div>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                          {s.bullets.map((b) => (
                            <li key={b}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Buenas prácticas */}
            <div
              id="tips"
              className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-extrabold text-slate-900">
                Buenas prácticas
              </h2>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-5">
                  <div className="text-sm font-bold text-slate-900">
                    Nombres consistentes
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Usa nombres claros y repetibles para geocercas, personal y
                    actividades. Esto mejora reportes y evita confusiones.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 p-5">
                  <div className="text-sm font-bold text-slate-900">
                    Geocercas bien dibujadas
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Evita polígonos enormes. Un área precisa genera entradas/salidas
                    más confiables.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 p-5">
                  <div className="text-sm font-bold text-slate-900">
                    Actividades con costo
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Define costo por hora y moneda desde el inicio para que el
                    dashboard de costos tenga sentido.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 p-5">
                  <div className="text-sm font-bold text-slate-900">
                    Tracker con permisos correctos
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Asegura permisos de ubicación adecuados para evitar registros
                    incompletos.
                  </p>
                </div>
              </div>
            </div>

            {/* Resultado final */}
            <div
              id="resultado"
              className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-extrabold text-slate-900">
                Resultado final
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Después de completar la guía, tendrás:
              </p>

              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-700">
                <li>Control automático del personal por geocercas.</li>
                <li>Horas y costos calculados sin reportes manuales.</li>
                <li>Reportes confiables por persona, actividad y geocerca.</li>
                <li>Base sólida para auditoría, control y toma de decisiones.</li>
              </ul>

              <div className="mt-5 rounded-2xl bg-emerald-50 p-5">
                <div className="text-sm font-bold text-emerald-900">
                  Siguiente paso sugerido
                </div>
                <div className="mt-1 text-sm text-emerald-900/80">
                  Mira el “Video demo” y revisa “Preguntas frecuentes” para
                  acelerar el onboarding del equipo.
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <a
                href="/"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                Volver al panel
              </a>

              <div className="flex flex-col gap-2 sm:flex-row">
                <a
                  href="/help/faq"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  Ir a FAQ
                </a>
                <a
                  href="/help/support"
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                >
                  Contactar soporte
                </a>
              </div>
            </div>

            <div className="mt-6 text-xs text-slate-500">
              Nota: En el siguiente paso conectaremos esta página al botón “Ver
              instrucciones” y a tu router real.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
