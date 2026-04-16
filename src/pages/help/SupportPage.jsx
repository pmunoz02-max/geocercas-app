import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function SupportPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const support = useMemo(() => {
    const email = (import.meta.env.VITE_SUPPORT_EMAIL || "").trim();
    const whatsapp = (import.meta.env.VITE_SUPPORT_WHATSAPP || "").trim();
    const calendly = (import.meta.env.VITE_SUPPORT_CALENDLY || "").trim();
    return { email, whatsapp, calendly };
  }, []);

  const commonIssues = useMemo(
    () => [
      {
        title: t("help.support.commonIssues.invite.title", {
          defaultValue: "No puedo aceptar la invitación",
        }),
        body: t("help.support.commonIssues.invite.body", {
          defaultValue:
            "Abre el enlace más reciente que te enviaron. Si ya venció o aparece error, pide una nueva invitación.",
        }),
      },
      {
        title: t("help.support.commonIssues.link.title", {
          defaultValue: "El enlace no funciona",
        }),
        body: t("help.support.commonIssues.link.body", {
          defaultValue:
            "Cópialo completo en tu navegador del teléfono o ábrelo directamente desde el mensaje original.",
        }),
      },
      {
        title: t("help.support.commonIssues.tracking.title", {
          defaultValue: "No veo seguimiento activo",
        }),
        body: t("help.support.commonIssues.tracking.body", {
          defaultValue:
            "Revisa que tengas internet, sesión iniciada y una asignación activa. Luego vuelve a abrir el tracker.",
        }),
      },
      {
        title: t("help.support.commonIssues.permissions.title", {
          defaultValue: "Permisos de ubicación desactivados",
        }),
        body: t("help.support.commonIssues.permissions.body", {
          defaultValue:
            "En ajustes del teléfono, habilita ubicación para la app y vuelve a intentarlo.",
        }),
      },
      {
        title: t("help.support.commonIssues.account.title", {
          defaultValue: "Estoy en la cuenta u organización incorrecta",
        }),
        body: t("help.support.commonIssues.account.body", {
          defaultValue:
            "Cierra sesión e ingresa con el correo correcto. Si aplica, usa el enlace de invitación de la organización correcta.",
        }),
      },
    ],
    [t]
  );

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs text-slate-500">
            {t("help.common.breadcrumb")} / {t("help.support.title")}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {t("help.support.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t("help.support.subtitle")}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("help.common.back")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/inicio")}
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {t("help.common.goHome")}
          </button>
        </div>
      </div>

      {/* Contact */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="mb-2 text-xs font-semibold text-slate-500">
          {t("help.support.emailLabel")}
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
            {t("help.support.notConfigured")}
          </div>
        )}

        {/* Optional future channels (kept for later rollout) */}
        {(support.whatsapp || support.calendly) ? (
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            {support.whatsapp ? (
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">
                  WhatsApp
                </div>
                <a
                  href={support.whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-sm font-medium text-slate-900 underline underline-offset-2"
                >
                  {support.whatsapp}
                </a>
              </div>
            ) : null}

            {support.calendly ? (
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">
                  Calendly
                </div>
                <a
                  href={support.calendly}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-sm font-medium text-slate-900 underline underline-offset-2"
                >
                  {support.calendly}
                </a>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 text-xs text-slate-500">
          {t("help.common.viewFaq")}{" "}
          <button
            type="button"
            onClick={() => navigate("/help/faq")}
            className="font-semibold text-slate-900 underline underline-offset-2"
          >
            {t("help.faq.title")}
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          {t("help.support.commonIssues.title", { defaultValue: "Problemas comunes" })}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {t("help.support.commonIssues.subtitle", {
            defaultValue:
              "Si algo no funciona, revisa estas soluciones rápidas antes de contactar soporte.",
          })}
        </p>

        <div className="mt-4 space-y-3">
          {commonIssues.map((issue) => (
            <div key={issue.title} className="rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-900">{issue.title}</div>
              <div className="mt-1 text-sm text-slate-600">{issue.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
