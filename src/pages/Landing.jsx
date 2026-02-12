// src/pages/Landing.jsx
import React from "react";
import { Link } from "react-router-dom";
import LanguageSwitcher from "../components/LanguageSwitcher";

// ✅ BUILD MARKER (preview): si NO ves esto en consola, NO estás viendo el último deploy
console.info("BUILD_MARKER_PREVIEW_20260212_A");

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
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
              className={[
                "inline-flex items-center justify-center rounded-2xl px-5 py-3 font-semibold",
                "bg-white text-slate-900",
                "hover:bg-slate-100 active:bg-white",
                "focus:outline-none focus:ring-2 focus:ring-white/60",
                // blindaje contra CSS global que baje opacidad o quite click
                "!opacity-100 !pointer-events-auto",
              ].join(" ")}
            >
              Iniciar sesión
            </Link>

            <Link
              to="/help/instructions"
              className={[
                "inline-flex items-center justify-center rounded-2xl px-5 py-3",
                "border border-slate-700 text-slate-100",
                "hover:bg-slate-900/60",
                "focus:outline-none focus:ring-2 focus:ring-white/30",
                "!opacity-100 !pointer-events-auto",
              ].join(" ")}
            >
              Ayuda
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
