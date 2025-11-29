// src/pages/Login.jsx
import React from "react";

export default function Login() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">
          Iniciar sesión
        </h1>
        <p className="text-sm text-slate-600">
          Esta es una página de login de placeholder. Más adelante podemos
          conectar aquí el flujo real de autenticación (Supabase, magic link,
          etc.).
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Correo electrónico
            </label>
            <input
              type="email"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="tucorreo@ejemplo.com"
              disabled
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Contraseña
            </label>
            <input
              type="password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="••••••••"
              disabled
            />
          </div>
          <button
            type="button"
            disabled
            className="w-full inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white opacity-60 cursor-not-allowed"
          >
            Iniciar sesión (placeholder)
          </button>
        </div>

        <p className="text-[11px] text-slate-500">
          Si ya tienes un flujo de login implementado en otro archivo, luego
          podemos reemplazar este componente por el tuyo.
        </p>
      </div>
    </div>
  );
}
