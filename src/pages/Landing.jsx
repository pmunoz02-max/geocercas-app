// src/pages/Landing.jsx
import React from "react";
import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col">
      {/* Barra superior simple */}
      <header className="w-full border-b border-white/10 bg-slate-950/60 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-emerald-500/90 flex items-center justify-center shadow-lg shadow-emerald-500/40">
              <span className="text-xs font-bold tracking-tight">AG</span>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-tight">
                App Geocercas
              </span>
              <span className="text-[11px] text-slate-400">
                Control de personal por geocercas
              </span>
            </div>
          </div>

          {/* Solo un enlace discreto a Login */}
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="text-xs md:text-sm text-slate-200 hover:text-white transition-colors"
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-10 md:py-16 grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          {/* Columna izquierda: Hero / texto */}
          <section className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-medium text-emerald-300">
                SaaS para operaciones agrícolas y de campo
              </span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-white">
                Controla tu personal{" "}
                <span className="text-emerald-400">por geocercas</span> en tiempo
                real.
              </h1>
              <p className="text-sm md:text-base text-slate-300 max-w-xl">
                App Geocercas te ayuda a organizar geocercas, personal, actividades
                y reportes de costos, todo en una sola plataforma pensada para
                operaciones agrícolas y de campo.
              </p>
            </div>

            {/* CTA principal */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition-colors"
              >
                Iniciar sesión
              </Link>

              <Link
                to="/login?mode=magic"
                className="inline-flex items-center justify-center rounded-xl border border-emerald-400/60 bg-slate-900/60 px-4 py-2.5 text-sm font-medium text-emerald-200 hover:bg-slate-800/80 transition-colors"
              >
                Recibir link mágico por correo
              </Link>
            </div>

            {/* Bullets de valor */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs md:text-sm text-slate-300">
              <div className="rounded-lg border border-white/5 bg-slate-900/60 p-3 space-y-1">
                <div className="text-[11px] font-medium text-emerald-300">
                  Geocercas
                </div>
                <p className="text-[11px] md:text-xs text-slate-300">
                  Dibuja zonas de trabajo y controla quién entra, sale y cuánto
                  tiempo permanece.
                </p>
              </div>
              <div className="rounded-lg border border-white/5 bg-slate-900/60 p-3 space-y-1">
                <div className="text-[11px] font-medium text-emerald-300">
                  Personal & Actividades
                </div>
                <p className="text-[11px] md:text-xs text-slate-300">
                  Asigna personas a actividades, turnos y geocercas según tu
                  planificación diaria.
                </p>
              </div>
              <div className="rounded-lg border border-white/5 bg-slate-900/60 p-3 space-y-1">
                <div className="text-[11px] font-medium text-emerald-300">
                  Reportes de costos
                </div>
                <p className="text-[11px] md:text-xs text-slate-300">
                  Obtén reportes por persona, actividad, geocerca y rango de
                  fechas para tomar decisiones.
                </p>
              </div>
            </div>
          </section>

          {/* Columna derecha: “mock” de app / geocercas */}
          <section className="relative">
            <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="absolute -bottom-6 -left-8 h-32 w-32 rounded-full bg-emerald-400/10 blur-3xl" />

            <div className="relative rounded-2xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-black/40 backdrop-blur-sm p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    Panel en vivo
                  </p>
                  <p className="text-sm font-medium text-slate-50">
                    Geocercas & Tracker
                  </p>
                </div>
                <div className="flex -space-x-2">
                  <div className="h-6 w-6 rounded-full border border-slate-900 bg-emerald-500/90" />
                  <div className="h-6 w-6 rounded-full border border-slate-900 bg-emerald-300/90" />
                  <div className="h-6 w-6 rounded-full border border-slate-900 bg-slate-500/90" />
                </div>
              </div>

              {/* Mini mapa estilizado */}
              <div className="rounded-xl border border-emerald-500/30 bg-slate-950/70 p-3 space-y-3">
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span>Zonas activas</span>
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Online
                  </span>
                </div>
                <div className="relative h-40 rounded-lg bg-[radial-gradient(circle_at_top,_#22c55e33,_transparent_55%),radial-gradient(circle_at_bottom,_#0ea5e933,_transparent_55%),linear-gradient(135deg,_#020617,_#020617)] overflow-hidden">
                  {/* Geocercas simuladas */}
                  <div className="absolute inset-4 border border-emerald-500/30 rounded-xl" />
                  <div className="absolute left-4 top-6 h-10 w-16 border border-emerald-400/60 rounded-md" />
                  <div className="absolute right-6 bottom-5 h-12 w-20 border border-emerald-500/40 rounded-lg" />

                  {/* Puntos tracker */}
                  <div className="absolute left-10 top-10 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.8)]" />
                  <div className="absolute left-16 top-20 h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_10px_2px_rgba(52,211,153,0.7)]" />
                  <div className="absolute right-10 bottom-10 h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_10px_2px_rgba(56,189,248,0.7)]" />
                </div>
              </div>

              {/* Chips inferiores */}
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-200">
                <div className="rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 space-y-0.5">
                  <p className="font-medium">Control de asistencia</p>
                  <p className="text-[10px] text-slate-400">
                    Desde el campo hasta el reporte de costos.
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 space-y-0.5">
                  <p className="font-medium">Multi-organización</p>
                  <p className="text-[10px] text-slate-400">
                    Maneja varias fincas, lotes o unidades de negocio.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer simple */}
      <footer className="border-t border-white/10 bg-slate-950/80">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400">
          <p>© {new Date().getFullYear()} App Geocercas. Todos los derechos reservados.</p>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="#faq"
              className="hover:text-slate-200 transition-colors"
            >
              FAQ
            </a>
            <a
              href="mailto:soporte@tugeocercas.com"
              className="hover:text-slate-200 transition-colors"
            >
              Soporte
            </a>
            <a
              href="#terminos"
              className="hover:text-slate-200 transition-colors"
            >
              Términos
            </a>
            <a
              href="#privacidad"
              className="hover:text-slate-200 transition-colors"
            >
              Privacidad
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
