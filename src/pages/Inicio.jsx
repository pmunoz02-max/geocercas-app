// src/pages/Inicio.jsx
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function Inicio() {
  const { user, profile, currentOrg, currentRole } = useAuth();

  const userEmail = user?.email || "";
  const roleLabel = (currentRole || "—").toUpperCase();
  const orgName = currentOrg?.name || "—";
  const orgId = currentOrg?.id || "—";
  const profileName =
    profile?.full_name || profile?.nombre || profile?.name || "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-emerald-50/25">
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Encabezado */}
        <section className="flex flex-col gap-3">
          <div>
            <p className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-emerald-700">
              Panel de control · App Geocercas
            </p>
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
              Bienvenido a tu panel
            </h1>
            <p className="mt-2 max-w-2xl text-sm md:text-base text-slate-600">
              Gestiona geocercas, personal, actividades, asignaciones y reportes
              de costos en un solo lugar.
            </p>
          </div>
        </section>

        {/* Tarjetas principales */}
        <section className="grid gap-5 md:grid-cols-3 lg:gap-6">
          {/* Nueva geocerca */}
          <article className="group relative overflow-hidden rounded-2xl border border-emerald-100 bg-white/95 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-emerald-400/80 hover:shadow-lg hover:shadow-emerald-100">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-50/80 via-transparent to-sky-50/80 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div className="relative flex flex-col justify-between h-full">
              <div className="space-y-2">
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  Geocercas
                </span>
                <h2 className="text-lg font-semibold text-slate-900">
                  Nueva geocerca
                </h2>
                <p className="text-sm leading-relaxed text-slate-600">
                  Crea una nueva geocerca para controlar actividades en campo.
                </p>
              </div>
              <div className="mt-4">
                <Link
                  to="/nueva-geocerca"
                  className="inline-flex items-center text-sm font-semibold text-emerald-700 transition-colors group-hover:text-emerald-800"
                >
                  Ir a Nueva geocerca
                  <span className="ml-1 transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              </div>
            </div>
          </article>

          {/* Geocercas */}
          <article className="group relative overflow-hidden rounded-2xl border border-emerald-100 bg-white/95 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-emerald-400/80 hover:shadow-lg hover:shadow-emerald-100">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-50/80 via-transparent to-lime-50/80 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div className="relative flex flex-col justify-between h-full">
              <div className="space-y-2">
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  Geocercas
                </span>
                <h2 className="text-lg font-semibold text-slate-900">
                  Geocercas
                </h2>
                <p className="text-sm leading-relaxed text-slate-600">
                  Administra las geocercas existentes y asigna personal.
                </p>
              </div>
              <div className="mt-4">
                <Link
                  to="/geocercas"
                  className="inline-flex items-center text-sm font-semibold text-emerald-700 transition-colors group-hover:text-emerald-800"
                >
                  Ir a Geocercas
                  <span className="ml-1 transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              </div>
            </div>
          </article>

          {/* Personal */}
          <article className="group relative overflow-hidden rounded-2xl border border-sky-100 bg-white/95 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-sky-400/80 hover:shadow-lg hover:shadow-sky-100">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-50/80 via-transparent to-indigo-50/80 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div className="relative flex flex-col justify-between h-full">
              <div className="space-y-2">
                <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  Personal
                </span>
                <h2 className="text-lg font-semibold text-slate-900">
                  Personal
                </h2>
                <p className="text-sm leading-relaxed text-slate-600">
                  Registra y administra el personal de tu organización.
                </p>
              </div>
              <div className="mt-4">
                <Link
                  to="/personal"
                  className="inline-flex items-center text-sm font-semibold text-sky-700 transition-colors group-hover:text-sky-800"
                >
                  Ir a Personal
                  <span className="ml-1 transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              </div>
            </div>
          </article>

          {/* Actividades */}
          <article className="group relative overflow-hidden rounded-2xl border border-amber-100 bg-white/95 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-amber-400/80 hover:shadow-lg hover:shadow-amber-100">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-50/80 via-transparent to-orange-50/80 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div className="relative flex flex-col justify-between h-full">
              <div className="space-y-2">
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                  Tarifas
                </span>
                <h2 className="text-lg font-semibold text-slate-900">
                  Actividades
                </h2>
                <p className="text-sm leading-relaxed text-slate-600">
                  Configura actividades y tarifas horarias por tipo de trabajo.
                </p>
              </div>
              <div className="mt-4">
                <Link
                  to="/actividades"
                  className="inline-flex items-center text-sm font-semibold text-amber-700 transition-colors group-hover:text-amber-800"
                >
                  Ir a Actividades
                  <span className="ml-1 transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              </div>
            </div>
          </article>

          {/* Asignaciones */}
          <article className="group relative overflow-hidden rounded-2xl border border-purple-100 bg-white/95 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-purple-400/80 hover:shadow-lg hover:shadow-purple-100">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-50/80 via-transparent to-fuchsia-50/80 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div className="relative flex flex-col justify-between h-full">
              <div className="space-y-2">
                <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-purple-700">
                  Operaciones
                </span>
                <h2 className="text-lg font-semibold text-slate-900">
                  Asignaciones
                </h2>
                <p className="text-sm leading-relaxed text-slate-600">
                  Asigna personal a geocercas y actividades en rangos de fechas.
                </p>
              </div>
              <div className="mt-4">
                <Link
                  to="/asignaciones"
                  className="inline-flex items-center text-sm font-semibold text-purple-700 transition-colors group-hover:text-purple-800"
                >
                  Ir a Asignaciones
                  <span className="ml-1 transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              </div>
            </div>
          </article>

          {/* Reportes */}
          <article className="group relative overflow-hidden rounded-2xl border border-emerald-100 bg-white/95 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-emerald-400/80 hover:shadow-lg hover:shadow-emerald-100">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-50/80 via-transparent to-slate-50/80 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div className="relative flex flex-col justify-between h-full">
              <div className="space-y-2">
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  Costos
                </span>
                <h2 className="text-lg font-semibold text-slate-900">
                  Reportes
                </h2>
                <p className="text-sm leading-relaxed text-slate-600">
                  Consulta reportes de costos por actividad, geocerca, persona y
                  fechas.
                </p>
              </div>
              <div className="mt-4">
                <Link
                  to="/costos"
                  className="inline-flex items-center text-sm font-semibold text-emerald-700 transition-colors group-hover:text-emerald-800"
                >
                  Ir a Reportes
                  <span className="ml-1 transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              </div>
            </div>
          </article>

          {/* Dashboard de costos */}
          <article className="group relative overflow-hidden rounded-2xl border border-sky-100 bg-white/95 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-sky-400/80 hover:shadow-lg hover:shadow-sky-100">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-50/80 via-transparent to-cyan-50/80 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div className="relative flex flex-col justify-between h-full">
              <div className="space-y-2">
                <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  Dashboard
                </span>
                <h2 className="text-lg font-semibold text-slate-900">
                  Dashboard de costos
                </h2>
                <p className="text-sm leading-relaxed text-slate-600">
                  Panel gráfico tipo Power BI para explorar costos y horas por
                  persona, actividad y geocerca.
                </p>
              </div>
              <div className="mt-4">
                <Link
                  to="/costos-dashboard"
                  className="inline-flex items-center text-sm font-semibold text-sky-700 transition-colors group-hover:text-sky-800"
                >
                  Ir al Dashboard
                  <span className="ml-1 transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              </div>
            </div>
          </article>

          {/* Tracker */}
          <article className="group relative overflow-hidden rounded-2xl border border-emerald-100 bg-white/95 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-emerald-400/80 hover:shadow-lg hover:shadow-emerald-100">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-50/80 via-transparent to-teal-50/80 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div className="relative flex flex-col justify-between h-full">
              <div className="space-y-2">
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  GPS
                </span>
                <h2 className="text-lg font-semibold text-slate-900">
                  Tracker
                </h2>
                <p className="text-sm leading-relaxed text-slate-600">
                  Revisa el tablero de posiciones enviadas desde los trackers.
                </p>
              </div>
              <div className="mt-4">
                <Link
                  to="/tracker-dashboard"
                  className="inline-flex items-center text-sm font-semibold text-emerald-700 transition-colors group-hover:text-emerald-800"
                >
                  Ir al Tracker
                  <span className="ml-1 transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              </div>
            </div>
          </article>

          {/* Invitar tracker */}
          <article className="group relative overflow-hidden rounded-2xl border border-indigo-100 bg-white/95 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-indigo-400/80 hover:shadow-lg hover:shadow-indigo-100">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50/80 via-transparent to-sky-50/80 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div className="relative flex flex-col justify-between h-full">
              <div className="space-y-2">
                <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                  Invitaciones
                </span>
                <h2 className="text-lg font-semibold text-slate-900">
                  Invitar tracker
                </h2>
                <p className="text-sm leading-relaxed text-slate-600">
                  Envía invitaciones a nuevos usuarios tracker por correo.
                </p>
              </div>
              <div className="mt-4">
                <Link
                  to="/invitar-tracker"
                  className="inline-flex items-center text-sm font-semibold text-indigo-700 transition-colors group-hover:text-indigo-800"
                >
                  Ir a Invitar tracker
                  <span className="ml-1 transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              </div>
            </div>
          </article>

          {/* Admins */}
          <article className="group relative overflow-hidden rounded-2xl border border-rose-100 bg-white/95 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-rose-400/80 hover:shadow-lg hover:shadow-rose-100">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-rose-50/80 via-transparent to-orange-50/80 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div className="relative flex flex-col justify-between h-full">
              <div className="space-y-2">
                <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                  Organización
                </span>
                <h2 className="text-lg font-semibold text-slate-900">
                  Admins
                </h2>
                <p className="text-sm leading-relaxed text-slate-600">
                  Gestiona administradores y miembros de la organización.
                </p>
              </div>
              <div className="mt-4">
                <Link
                  to="/admins"
                  className="inline-flex items-center text-sm font-semibold text-rose-700 transition-colors group-hover:text-rose-800"
                >
                  Ir a Admins
                  <span className="ml-1 transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              </div>
            </div>
          </article>
        </section>

        {/* Info de usuario / contexto */}
        <section className="rounded-2xl border border-slate-200 bg-white/95 p-4 text-sm text-slate-700 shadow-sm">
          <p>
            Estás conectado como{" "}
            <span className="font-semibold text-slate-900">{userEmail}</span>{" "}
            con rol{" "}
            <span className="font-semibold text-emerald-700">{roleLabel}</span>{" "}
            en la organización{" "}
            <span className="font-semibold text-slate-900">{orgName}</span>.
          </p>
          {profileName && (
            <p className="mt-1">
              Usuario:{" "}
              <span className="font-semibold text-slate-900">
                {profileName}
              </span>
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Org ID actual: <span className="font-mono">{orgId}</span>
          </p>
        </section>
      </main>
    </div>
  );
}
