// src/pages/Inicio.jsx
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function Inicio() {
  const { user, profile, currentOrg, currentRole } = useAuth();

  const userEmail = user?.email || "";
  const roleLabel = (currentRole || "—").toUpperCase();
  const orgName = currentOrg?.name || "—";
  const profileName =
    profile?.full_name || profile?.nombre || profile?.name || "";

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Encabezado */}
        <section>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mb-2">
            Bienvenido a tu panel
          </h1>
          <p className="text-sm md:text-base text-slate-600">
            Gestiona geocercas, personal, actividades, asignaciones y reportes
            de costos en un solo lugar.
          </p>
        </section>

        {/* Tarjetas principales */}
        <section className="grid gap-4 md:grid-cols-3">
          {/* Nueva geocerca */}
          <article className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Nueva geocerca
              </h2>
              <p className="text-sm text-slate-600">
                Crea una nueva geocerca para controlar actividades en campo.
              </p>
            </div>
            <div className="mt-4">
              <Link
                to="/nueva-geocerca"
                className="inline-flex items-center text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                Ir a Nueva geocerca →
              </Link>
            </div>
          </article>

          {/* Geocercas */}
          <article className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Geocercas
              </h2>
              <p className="text-sm text-slate-600">
                Administra las geocercas existentes y asigna personal.
              </p>
            </div>
            <div className="mt-4">
              <Link
                to="/geocercas"
                className="inline-flex items-center text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                Ir a Geocercas →
              </Link>
            </div>
          </article>

          {/* Personal */}
          <article className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Personal
              </h2>
              <p className="text-sm text-slate-600">
                Registra y administra el personal de tu organización.
              </p>
            </div>
            <div className="mt-4">
              <Link
                to="/personal"
                className="inline-flex items-center text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                Ir a Personal →
              </Link>
            </div>
          </article>

          {/* Actividades */}
          <article className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Actividades
              </h2>
              <p className="text-sm text-slate-600">
                Configura actividades y tarifas horarias por tipo de trabajo.
              </p>
            </div>
            <div className="mt-4">
              <Link
                to="/actividades"
                className="inline-flex items-center text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                Ir a Actividades →
              </Link>
            </div>
          </article>

          {/* Asignaciones */}
          <article className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Asignaciones
              </h2>
              <p className="text-sm text-slate-600">
                Asigna personal a geocercas y actividades en rangos de fechas.
              </p>
            </div>
            <div className="mt-4">
              <Link
                to="/asignaciones"
                className="inline-flex items-center text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                Ir a Asignaciones →
              </Link>
            </div>
          </article>

          {/* 🔥 Reportes (antes Costos) */}
          <article className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Reportes
              </h2>
              <p className="text-sm text-slate-600">
                Consulta reportes de costos por actividad, geocerca, persona y
                fechas.
              </p>
            </div>
            <div className="mt-4">
              <Link
                to="/costos"
                className="inline-flex items-center text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                Ir a Reportes →
              </Link>
            </div>
          </article>

          {/* Tracker */}
          <article className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Tracker
              </h2>
              <p className="text-sm text-slate-600">
                Revisa el tablero de posiciones enviadas desde los trackers.
              </p>
            </div>
            <div className="mt-4">
              <Link
                to="/tracker-dashboard"
                className="inline-flex items-center text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                Ir al Tracker →
              </Link>
            </div>
          </article>

          {/* Invitar tracker */}
          <article className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Invitar tracker
              </h2>
              <p className="text-sm text-slate-600">
                Envía invitaciones a nuevos usuarios tracker por correo.
              </p>
            </div>
            <div className="mt-4">
              <Link
                to="/invitar-tracker"
                className="inline-flex items-center text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                Ir a Invitar tracker →
              </Link>
            </div>
          </article>

          {/* Admins */}
          <article className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Admins
              </h2>
              <p className="text-sm text-slate-600">
                Gestiona administradores y miembros de la organización.
              </p>
            </div>
            <div className="mt-4">
              <Link
                to="/admins"
                className="inline-flex items-center text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                Ir a Admins →
              </Link>
            </div>
          </article>
        </section>

        {/* Info de usuario / contexto */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-sm text-slate-700 space-y-1">
          <p>
            Estás conectado como{" "}
            <span className="font-semibold">{userEmail}</span> con rol{" "}
            <span className="font-semibold">{roleLabel}</span> en la
            organización <span className="font-semibold">{orgName}</span>.
          </p>
          {profileName && (
            <p>
              Usuario: <span className="font-semibold">{profileName}</span>
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
