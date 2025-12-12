import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";

export default function SupportPage() {
  const navigate = useNavigate();

  const diag = useMemo(() => {
    const env = import.meta.env || {};
    const keys = Object.keys(env || {});
    const supportKeys = keys.filter((k) => k.startsWith("VITE_SUPPORT"));
    const hasEmailKey = supportKeys.includes("VITE_SUPPORT_EMAIL");

    const email = (env.VITE_SUPPORT_EMAIL || "").trim();
    const whatsapp = (env.VITE_SUPPORT_WHATSAPP || "").trim();
    const calendly = (env.VITE_SUPPORT_CALENDLY || "").trim();

    return {
      email,
      whatsapp,
      calendly,
      __debug: {
        mode: env.MODE,
        prod: env.PROD,
        baseUrl: env.BASE_URL,
        supportKeys,
        hasEmailKey,
        emailLength: email.length,
      },
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
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
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={() => navigate("/inicio")}
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            Ir a Inicio
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="text-xs text-slate-500 mb-1">Email</div>

        {diag.email ? (
          <a
            className="text-sm font-medium text-slate-900 underline underline-offset-2"
            href={`mailto:${diag.email}`}
          >
            {diag.email}
          </a>
        ) : (
          <div className="text-sm text-red-600">
            ❌ No llega <span className="font-mono">VITE_SUPPORT_EMAIL</span>
          </div>
        )}

        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
          <div className="font-semibold mb-2">Diagnóstico</div>
          <pre className="whitespace-pre-wrap">
{JSON.stringify(diag.__debug, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
