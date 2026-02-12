// src/pages/Landing.jsx
import React from "react";
import { Link } from "react-router-dom";
import LanguageSwitcher from "../components/LanguageSwitcher";

const BUILD_MARKER = "PREVIEW_20260212_B"; // <- si no ves esto en pantalla, NO estás en el último deploy

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center relative">
      {/* ✅ marcador VISIBLE */}
      <div className="fixed bottom-3 right-4 text-[11px] text-slate-400 select-none">
        {BUILD_MARKER}
      </div>

      <div className="max-w-xl w-full px-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-8 shadow-2xl">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-3xl font-semibold">Geocercas</h1>
            <LanguageSwitcher />
          </div>

          <p className="mt-4 text-sm text-slate-300">
            Bienvenido. Inicia sesión para administrar tus geocercas.
          </p>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Link
              to="/login"
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
              Iniciar sesión
            </Link>

            <Link
              to="/help/instructions"
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
              Ayuda
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
