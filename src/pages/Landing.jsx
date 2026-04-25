// src/pages/Landing.jsx
import React from "react";
import { Link, useLocation } from "react-router-dom";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function Landing() {
  const location = useLocation();
  const withSameSearch = (path) => `${path}${location.search || ""}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/90">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-5">
          <Link to={withSameSearch("/")} className="text-lg font-semibold tracking-tight text-white">
            App Geocercas
          </Link>

          <nav className="hidden items-center gap-5 text-sm text-slate-300 md:flex">
            <a href="#features" className="hover:text-white">Producto</a>
            <a href="#pricing" className="hover:text-white">Precios</a>
            <a href="#contact" className="hover:text-white">Contacto</a>
            <Link to={withSameSearch("/privacy")} className="hover:text-white">Privacidad</Link>
            <Link to={withSameSearch("/terms")} className="hover:text-white">Términos</Link>
          </nav>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              to={withSameSearch("/auth")}
              className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-10 px-6 py-16 md:grid-cols-2 lg:py-24">
          <div className="space-y-7">

            <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold tracking-wide text-sky-300">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              Plataforma SaaS para control operativo GPS
            </div>

            <ul className="text-gray-200 space-y-1 mt-4">
              <li>
                <span className="font-bold">Plan Pro:</span> USD 29/mes por organización, hasta 50 trackers.
              </li>
              <li>
                <span className="font-bold">Plan Empresas:</span> USD 99/mes para más de 50 trackers.
              </li>
            </ul>

            <div className="max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg mt-4">
              Supervisa equipos de campo, valida entradas y salidas de zonas autorizadas, revisa ubicaciones GPS y genera reportes para tu operación desde una plataforma web segura.
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                to={withSameSearch("/auth")}
                className="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-6 py-3 text-lg font-bold text-white shadow-lg shadow-sky-900/30 transition hover:bg-sky-400"
              >
                Empezar ahora
              </Link>
              <Link
                to={withSameSearch("/auth")}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
              >
                Iniciar sesión
              </Link>
              <a
                href="#pricing"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
              >
                Ver precios
              </a>
            </div>

            <p className="text-xs leading-relaxed text-slate-400">
              Acceso para organizaciones, administradores y trackers invitados. El flujo de tracker usa invitación segura sin Magic Link.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-2xl">
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Dashboard</p>
                  <h2 className="text-lg font-semibold text-white">Monitoreo operativo</h2>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  En línea
                </span>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <p className="text-xs text-slate-400">Trackers activos</p>
                  <p className="mt-2 text-3xl font-bold text-white">24</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <p className="text-xs text-slate-400">Eventos de geocerca</p>
                  <p className="mt-2 text-3xl font-bold text-white">128</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs text-slate-400">Últimas posiciones</p>
                <div className="mt-4 space-y-3">
                  {["Equipo Norte", "Ruta Centro", "Supervisor Campo"].map((name) => (
                    <div key={name} className="flex items-center justify-between rounded-xl bg-slate-950 px-3 py-3">
                      <span className="text-sm font-medium text-slate-200">{name}</span>
                      <span className="text-xs text-sky-300">GPS actualizado</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto w-full max-w-7xl px-6 py-12">
          <div className="max-w-3xl space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Funciones principales
            </h2>
            <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
              Diseñado para empresas que necesitan visibilidad, trazabilidad y reportes de equipos móviles.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <span className="mb-3 inline-flex h-2.5 w-2.5 rounded-full bg-sky-400" />
              <h3 className="text-base font-semibold text-slate-100">Geocercas</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Define zonas de trabajo y valida presencia dentro o fuera de áreas autorizadas.
              </p>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <span className="mb-3 inline-flex h-2.5 w-2.5 rounded-full bg-indigo-400" />
              <h3 className="text-base font-semibold text-slate-100">Tracking GPS</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Monitorea posiciones de trackers invitados desde móvil o navegador compatible.
              </p>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <span className="mb-3 inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <h3 className="text-base font-semibold text-slate-100">Reportes</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Consulta actividad, movimientos, historial y eventos para auditoría operativa.
              </p>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <span className="mb-3 inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
              <h3 className="text-base font-semibold text-slate-100">Multi-organización</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Administra equipos, usuarios e invitaciones por organización de forma separada.
              </p>
            </article>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 py-12">
          <div className="rounded-3xl border border-slate-800/80 bg-slate-900/40 p-6 sm:p-8">
            <div className="max-w-3xl space-y-3">
              <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Casos de uso
              </h2>
              <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
                Útil para operaciones con personal móvil, rutas, supervisión de campo y control de zonas.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <h3 className="text-base font-semibold text-slate-100">Seguridad</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">Verifica rondas y presencia en puntos críticos.</p>
              </article>
              <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <h3 className="text-base font-semibold text-slate-100">Agricultura</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">Controla cuadrillas, lotes y desplazamientos en finca.</p>
              </article>
              <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <h3 className="text-base font-semibold text-slate-100">Servicios técnicos</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">Valida visitas, rutas y tiempos de atención.</p>
              </article>
              <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <h3 className="text-base font-semibold text-slate-100">Logística</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">Supervisa equipos móviles y eventos por ubicación.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto w-full max-w-7xl px-6 py-12">
          <div className="max-w-3xl space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Precios
            </h2>
            <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
              Planes simples para empezar y escalar según el tamaño de tu operación.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <article className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
              <h3 className="text-xl font-semibold text-white">Básico</h3>
              <p className="mt-2 text-sm text-slate-300">Para pruebas y equipos pequeños.</p>
              <p className="mt-5 text-3xl font-bold text-white">Gratis</p>
              <p className="mt-2 text-sm text-slate-400">Hasta 3 trackers.</p>
            </article>

            <article className="rounded-3xl border border-sky-500/60 bg-sky-500/10 p-6 shadow-lg shadow-sky-950/30">
              <h3 className="text-xl font-semibold text-white">Pro</h3>
              <p className="mt-2 text-sm text-slate-300">Para organizaciones en operación.</p>
              <p className="mt-5 text-3xl font-bold text-white">USD 29/mes</p>
              <p className="mt-2 text-sm text-slate-400">Hasta 50 trackers por organización.</p>
            </article>

            <article className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
              <h3 className="text-xl font-semibold text-white">Empresas</h3>
              <p className="mt-2 text-sm text-slate-300">Para operaciones grandes.</p>
              <p className="mt-5 text-3xl font-bold text-white">USD 99 / mes</p>
              <p className="mt-2 text-sm text-slate-400">Más de 50 trackers y soporte comercial.</p>
            </article>
          </div>
        </section>

        <section id="contact" className="mx-auto w-full max-w-7xl px-6 py-12">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/55 p-6 text-center shadow-2xl sm:p-10">
            <div className="mx-auto max-w-3xl space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Convierte posiciones GPS en control operativo
              </h2>
              <p className="mx-auto max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
                Para soporte, ventas o revisión de cuenta, contáctanos por correo.
              </p>
              <a
                href="mailto:soporte@geocercas.app"
                className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
              >
                soporte@geocercas.app
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 px-6 py-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 text-sm text-slate-400 md:flex-row">
          <p>© {new Date().getFullYear()} App Geocercas. Todos los derechos reservados.</p>
          <div className="flex flex-wrap items-center justify-center gap-4 underline underline-offset-4">
            <Link to={withSameSearch("/privacy")} className="hover:text-sky-300">Política de privacidad</Link>
            <Link to={withSameSearch("/terms")} className="hover:text-sky-300">Términos y condiciones</Link>
            <a href="mailto:soporte@tugeocercas.com" className="hover:text-sky-300">soporte@tugeocercas.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
