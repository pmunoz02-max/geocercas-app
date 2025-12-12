import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";

/**
 * SupportPage
 * - Página protegida (la protección la hace App.jsx con AuthGuard + Shell).
 * - Universal y “monetizable”: deja listo un bloque PRO (sin integrar pagos aún).
 * - Contactos configurables por variables de entorno (Vercel / .env.local).
 */

export default function SupportPage() {
  const navigate = useNavigate();

  const support = useMemo(() => {
    const email = (import.meta.env.VITE_SUPPORT_EMAIL || "").trim();
    const whatsapp = (import.meta.env.VITE_SUPPORT_WHATSAPP || "").trim(); // Ej: https://wa.me/593999999999
    const calendly = (import.meta.env.VITE_SUPPORT_CALENDLY || "").trim(); // Ej: https://calendly.com/tu-link
    return { email, whatsapp, calendly };
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="text-xs text-slate-500">Centro de Ayuda / Soporte</div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            Soporte
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Contacta al equipo o revisa soluciones rápidas en la FAQ.
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Volver
          </button>

          <button
            type="button"
            onClick={() => navigate("/help/faq")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Ver FAQ
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

      {/* Content */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Soporte estándar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="mb-2 inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
            Soporte estándar
          </div>

          <h2 className="text-base font-semibold text-slate-900">
            Respuesta por canales básicos
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Ideal para consultas generales: acceso, roles, geocercas, tracker,
            reportes y configuración.
          </p>

          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold text-slate-800">Email</div>
              {support.email ? (
                <a
                  className="mt-1 block text-sm font-medium text-slate-900 underline underline-offset-2"
                  href={`mailto:${support.email}`}
                >
                  {support.email}
                </a>
              ) : (
                <div className="mt-1 text-sm text-slate-500">
                  Configura <span className="font-mono">VITE_SUPPORT_EMAIL</span>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold text-slate-800">
                WhatsApp (opcional)
              </div>
              {support.whatsapp ? (
                <a
                  className="mt-1 block text-sm font-medium text-slate-900 underline underline-offset-2"
                  href={support.whatsapp}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir WhatsApp
                </a>
              ) : (
                <div className="mt-1 text-sm text-slate-500">
                  Configura{" "}
                  <span className="font-mono">VITE_SUPPORT_WHATSAPP</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold text-slate-800">
              Antes de escribir
            </div>
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-600 space-y-1">
              <li>Indica tu organización y rol (owner/admin/tracker).</li>
              <li>Describe el módulo: geocercas, personal, tracker, costos.</li>
              <li>Adjunta captura y la ruta donde ocurre el problema.</li>
            </ul>
          </div>
        </div>

        {/* Soporte PRO */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="mb-2 inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800">
            Soporte PRO
          </div>

          <h2 className="text-base font-semibold text-slate-900">
            Prioridad y acompañamiento
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Pensado para empresas con operación diaria: respuesta prioritaria,
            sesiones de onboarding y soporte para despliegues.
          </p>

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-sm font-semibold text-amber-900">
              Próximamente (monetizable)
            </div>
            <p className="mt-1 text-sm text-amber-800">
              Aquí conectaremos el control por plan (FREE/PRO) para mostrar
              botones y canales exclusivos.
            </p>
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold text-slate-800">
                Agenda una sesión (opcional)
              </div>
              {support.calendly ? (
                <a
                  className="mt-1 block text-sm font-medium text-slate-900 underline underline-offset-2"
                  href={support.calendly}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir agenda
                </a>
              ) : (
                <div className="mt-1 text-sm text-slate-500">
                  Configura{" "}
                  <span className="font-mono">VITE_SUPPORT_CALENDLY</span>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold text-slate-800">
                Qué incluye PRO (ejemplo)
              </div>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-600 space-y-1">
                <li>Respuesta prioritaria (SLA).</li>
                <li>Asistencia para configuración y onboarding.</li>
                <li>Revisión guiada de reportes/costos.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Nota de configuración */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        <div className="font-semibold text-slate-900 mb-1">Configuración</div>
        <div className="space-y-1">
          <div>
            <span className="font-mono">VITE_SUPPORT_EMAIL</span> = correo de
            soporte
          </div>
          <div>
            <span className="font-mono">VITE_SUPPORT_WHATSAPP</span> = enlace
            wa.me o link directo
          </div>
          <div>
            <span className="font-mono">VITE_SUPPORT_CALENDLY</span> = enlace de
            agenda (Calendly u otro)
          </div>
        </div>
      </div>
    </div>
  );
}
