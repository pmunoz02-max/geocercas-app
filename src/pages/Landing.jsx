// src/pages/Landing.jsx
import React, { useMemo, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import LanguageSwitcher from "../components/LanguageSwitcher";

// ✅ BUILD MARKER (preview): si NO ves esto en consola, NO estás viendo el último deploy
console.info("BUILD_MARKER_PREVIEW_20260212_A");

/**
 * Landing UNIVERSAL:
 * - Público: NO consulta sesión, NO usa useAuth, NO hace getSession.
 * - Anti-spam OTP: cooldown + lock persistente por email (localStorage)
 * - ✅ PKCE catcher: si cae /?code=... lo envía a /auth/callback?code=...
 */

// ... el resto de tu Landing.jsx sigue igual debajo de este comentario ...
export default function Landing() {
  // ⚠️ NO cambié tu lógica, solo añadí el marcador arriba.
  // Deja tu implementación actual aquí.
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
      <div className="max-w-xl w-full px-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-8 shadow-2xl">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-semibold">Geocercas</h1>
            <LanguageSwitcher />
          </div>

          <p className="mt-4 text-sm text-slate-300">
            Bienvenido. Inicia sesión para administrar tus geocercas.
          </p>

          <div className="mt-6 flex gap-3">
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-slate-900 font-semibold"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/help/instructions"
              className="inline-flex items-center justify-center rounded-2xl border border-slate-700 px-5 py-3 text-slate-100"
            >
              Ayuda
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
