// src/pages/GeocercasPage.jsx
import React from "react";
import { Link } from "react-router-dom";

export default function GeocercasPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mb-2">
          Geocercas
        </h1>
        <p className="text-sm md:text-base text-slate-600">
          Administra las geocercas de tu organización. Desde aquí puedes crear
          nuevas geocercas y revisar las existentes.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {/* Crear nueva geocerca */}
        <article className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-1">
              Nueva geocerca
            </h2>
            <p className="text-sm text-slate-600">
              Crea una nueva geocerca en el mapa y asígnala a tu personal o
              actividades.
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

        {/* Placeholder de listado (lo construiremos luego si hace falta) */}
        <article className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-1">
              Listado de geocercas
            </h2>
            <p className="text-sm text-slate-600">
              Próximamente podrás ver aquí el listado de geocercas existentes y
              sus detalles. Por ahora, usa la opción de Nueva geocerca para
              crear y editar.
            </p>
          </div>
        </article>
      </section>
    </div>
  );
}
