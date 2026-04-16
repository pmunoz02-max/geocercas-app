// src/pages/Landing.jsx
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import HeroGeocercasDemo from "@/components/marketing/HeroGeocercasDemo.jsx";
import LanguageSwitcher from "../components/LanguageSwitcher";

const BUILD_MARKER = "PREVIEW_20260218_A"; // <- cambia el marker para validar deploy

export default function Landing() {
  const { t } = useTranslation();
  const location = useLocation();

  // Conserva querystring (incluye ?lang=fr) cuando navegas a /login y /help
  const withSameSearch = (to) => `${to}${location.search || ""}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative">
      {/* ✅ marcador VISIBLE */}
      <div className="fixed bottom-3 right-4 text-[11px] text-slate-400 select-none">
        {BUILD_MARKER}
      </div>

      <main className="mx-auto w-full max-w-7xl space-y-10 px-4 py-6 sm:px-6 lg:px-8">
        <HeroGeocercasDemo />

        <section className="rounded-3xl border border-slate-800/80 bg-slate-900/40 p-6 sm:p-8">
          <div className="max-w-3xl space-y-3">
            <p className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs font-semibold tracking-wide text-sky-300">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              Ideal para operaciones en campo
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
              Controla personal, zonas y movimientos en una sola vista.
            </h2>
            <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
              Pensado para supervisión operativa, seguimiento por geocercas y validación de entradas y salidas
              en tiempo real.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="mb-3 inline-flex h-2.5 w-2.5 rounded-full bg-sky-400" />
              <h3 className="text-base font-semibold text-slate-100">Supervisión de personal</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Visualiza quién está en ruta, quién llegó y quién salió de un área operativa.
              </p>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="mb-3 inline-flex h-2.5 w-2.5 rounded-full bg-indigo-400" />
              <h3 className="text-base font-semibold text-slate-100">Control por zonas</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Define geocercas para sedes, rutas, clientes o áreas sensibles y recibe contexto visual inmediato.
              </p>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="mb-3 inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <h3 className="text-base font-semibold text-slate-100">Eventos de entrada y salida</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Convierte posiciones GPS en eventos fáciles de revisar para operación, auditoría y seguimiento.
              </p>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="mb-3 inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
              <h3 className="text-base font-semibold text-slate-100">Listo para equipos en campo</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Úsalo en operaciones comerciales, técnicas, logísticas o de supervisión territorial.
              </p>
            </article>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800/80 bg-slate-900/40 p-6 sm:p-8">
          <div className="max-w-3xl space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
              Casos de uso
            </h2>
            <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
              Cómo utilizan App Geocercas diferentes equipos operativos.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="mb-3 inline-flex h-2.5 w-2.5 rounded-full bg-sky-400" />
              <h3 className="text-base font-semibold text-slate-100">Seguridad privada</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Controla rondas de guardias, entradas a zonas restringidas y supervisión de turnos.
              </p>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="mb-3 inline-flex h-2.5 w-2.5 rounded-full bg-indigo-400" />
              <h3 className="text-base font-semibold text-slate-100">Equipos comerciales</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Verifica visitas a clientes, cobertura territorial y actividad de vendedores.
              </p>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="mb-3 inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <h3 className="text-base font-semibold text-slate-100">Operaciones técnicas</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Supervisa técnicos en campo y valida entradas y salidas en zonas de trabajo.
              </p>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="mb-3 inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
              <h3 className="text-base font-semibold text-slate-100">Logística urbana</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Monitorea movimientos dentro de zonas operativas y detecta eventos automáticamente.
              </p>
            </article>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/55 p-6 text-center shadow-2xl sm:p-10">
          <div className="mx-auto max-w-3xl space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs font-semibold tracking-wide text-sky-300">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              Empieza a monitorear tu operación
            </p>

            <h2 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
              Convierte posiciones GPS en control operativo.
            </h2>

            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
              App Geocercas permite visualizar personal, rutas y eventos de entrada y salida en tiempo real dentro
              de zonas definidas.
            </p>

            <div className="pt-2 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/demo"
                className="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-900/30 transition hover:bg-sky-400"
              >
                Ver demo del sistema
              </Link>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-600 bg-slate-900/70 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
              >
                Solicitar presentación
              </button>
            </div>
          </div>
        </section>

        <section className="flex justify-center pb-10">
          <div className="max-w-xl w-full px-0 sm:px-2">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-8 shadow-2xl">
              <div className="flex items-center justify-between gap-4">
                {/* Antes decía "Geocercas" hardcodeado */}
                <h1 className="text-3xl font-semibold">
                  {t("landing.brandName")}
                </h1>

                <div className="relative z-50">
                  <LanguageSwitcher />
                </div>
              </div>

              {/* Antes decía "Bienvenido..." hardcodeado */}
              <p className="mt-4 text-sm text-slate-300">
                {t("landing.accessBody")}
              </p>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link
                  to={withSameSearch("/login")}
                  className="inline-flex items-center justify-center rounded-2xl px-5 py-3 font-semibold"
                  // ✅ inline style para ganar a cualquier CSS global raro
                  style={{
                    backgroundColor: "#ffffff",
                    color: "#0f172a",
                    opacity: 1,
                    pointerEvents: "auto",
                    filter: "none",
                  }}
                >
                  {t("app.header.login")}
                </Link>

                <Link
                  to={withSameSearch("/help/instructions")}
                  className="inline-flex items-center justify-center rounded-2xl px-5 py-3"
                  style={{
                    backgroundColor: "transparent",
                    color: "#e5e7eb",
                    border: "1px solid #334155",
                    opacity: 1,
                    pointerEvents: "auto",
                    filter: "none",
                  }}
                >
                  {/* Usamos una key ya existente con traducción FR */}
                  {t("help.common.badge")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
