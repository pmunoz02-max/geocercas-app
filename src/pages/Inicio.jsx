// src/pages/Inicio.jsx
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function Inicio() {
  const { user, profile, currentOrg, currentRole, isOwner } = useAuth();

  const userEmail = user?.email || "";
  const roleLabel = (currentRole || "—").toUpperCase();
  const orgName = currentOrg?.name || "—";
  const profileName =
    profile?.full_name || profile?.nombre || profile?.name || "";

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Encabezado */}
        <section>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            App Geocercas
          </h1>
          <p className="text-slate-600">
            Dashboard de control de personal y geocercas en tiempo real.
          </p>
        </section>

        {/* Tarjetas principales */}
        <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Personal */}
          <article className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Personal
              </h2>
              <p className="text-sm text-slate-600">
                Gestiona trabajadores, datos de contacto y estados.
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

          {/* Asignaciones */}
          <article className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Asignaciones
              </h2>
              <p className="text-sm text-slate-600">
                Define qué personal entra a qué geocercas y en qué horarios.
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

          {/* Geocercas */}
          <article className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Geocercas
              </h2>
              <p className="text-sm text-slate-600">
                Crea y edita geocercas para controlar accesos y presencia.
              </p>
            </div>
            <div className="mt-4 flex gap-3">
              <Link
                to="/nueva-geocerca"
                className="inline-flex items-center text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                Crear geocerca →
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

          {/* Costos */}
          <article className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Costos
              </h2>
              <p className="text-sm text-slate-600">
                Consulta costos por actividad, geocerca, persona y fechas.
              </p>
            </div>
            <div className="mt-4">
              <Link
                to="/costos"
                className="inline-flex items-center text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                Ir a Costos →
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
                Visualiza en tiempo real la ubicación de tu personal.
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
                Envía enlaces de acceso a tus trabajadores para que usen el
                tracker desde su móvil.
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

          {/* 🔥 Administradores: solo OWNER */}
          {isOwner && (
            <article className="bg-white rounded-xl shadow-sm border border-amber-300 p-5 flex flex-col justify-between">
              <div>
                <h2 className="text-lg font-semibold text-amber-800 mb-1">
                  Administradores
                </h2>
                <p className="text-sm text-amber-700">
                  Gestiona administradores y permisos de tu organización
                  (<strong>solo OWNER</strong>).
                </p>
              </div>
              <div className="mt-4">
                <Link
                  to="/admins"
                  className="inline-flex items-center text-sm font-medium text-amber-800 hover:text-amber-900"
                >
                  Ir al módulo de Administradores →
                </Link>
              </div>
            </article>
          )}
        </section>

        {/* Resumen de sesión */}
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
