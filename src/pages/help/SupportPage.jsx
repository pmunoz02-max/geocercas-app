import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";

export default function SupportPage() {
  const navigate = useNavigate();

  const support = useMemo(() => {
    const email = (import.meta.env.VITE_SUPPORT_EMAIL || "").trim();
    const whatsapp = (import.meta.env.VITE_SUPPORT_WHATSAPP || "").trim();
    const calendly = (import.meta.env.VITE_SUPPORT_CALENDLY || "").trim();
    return { email, whatsapp, calendly };
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs text-slate-500">Centro de Ayuda / Soporte</div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            Soporte
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Contacta al equipo o revisa soluciones rápidas en la FAQ.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => navigate(-1)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Volver
          </button>
          <button
            onClick={() => navigate("/inicio")}
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Ir a Inicio
          </button>
        </div>
      </div>

      {/* Soporte estándar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="mb-2 text-xs font-semibold text-slate-500">
          Email
        </div>

        {support.email ? (
          <a
            href={`mailto:${support.email}`}
            className="text-sm font-medium text-slate-900 underline underline-offset-2"
          >
            {support.email}
          </a>
        ) : (
          <div className="text-sm text-slate-500">
            Contacto no configurado
          </div>
        )}
      </div>
    </div>
  );
}
