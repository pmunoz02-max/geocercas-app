import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";

export default function SupportPage() {
  const navigate = useNavigate();

  const support = useMemo(() => {
    const rawEnv = import.meta.env || {};
    const email = (rawEnv.VITE_SUPPORT_EMAIL || "").trim();
    const whatsapp = (rawEnv.VITE_SUPPORT_WHATSAPP || "").trim();
    const calendly = (rawEnv.VITE_SUPPORT_CALENDLY || "").trim();

    return {
      email,
      whatsapp,
      calendly,
      __debug: {
        hasEnv: !!rawEnv,
        emailLength: email.length,
        rawEmail: rawEnv.VITE_SUPPORT_EMAIL,
      },
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs text-slate-500">Centro de Ayuda / Soporte</div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Soporte</h1>
          <p className="mt-1 text-sm text-slate-600">
            Contacta al equipo o revisa soluciones rápidas en la FAQ.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => navigate(-1)}
            className="rounded-xl border px-3 py-2 text-sm"
          >
            Volver
          </button>
          <button
            onClick={() => navigate("/inicio")}
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white"
          >
            Ir a Inicio
          </button>
        </div>
      </div>

      {/* Soporte estándar */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900 mb-2">Email</h2>

        {support.email ? (
          <a
            href={`mailto:${support.email}`}
            className="text-sm font-medium text-slate-900 underline"
          >
            {support.email}
          </a>
        ) : (
          <div className="text-sm text-red-600">
            ❌ No llega VITE_SUPPORT_EMAIL
          </div>
        )}

        {/* 🔍 Diagnóstico visible (temporal) */}
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          <div className="font-semibold mb-1">Diagnóstico</div>
          <pre className="whitespace-pre-wrap">
{JSON.stringify(support.__debug, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
