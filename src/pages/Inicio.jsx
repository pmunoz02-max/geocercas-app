import React from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

function InfoPill({ label, value }) {
  if (!value) return null;
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-600 mr-2">
      <span className="font-semibold">{label}</span>
      <span className="font-mono text-[11px] truncate max-w-[160px]">
        {value}
      </span>
    </div>
  );
}

function StarterCard({ badge, title, body, cta, onCta, disabled, disabledText }) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow p-4">
      <div className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold mb-1">
        {badge}
      </div>

      <h3 className="text-sm font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-xs text-slate-600 flex-1 mb-3">{body}</p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={
            disabled
              ? "self-start inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-500 cursor-not-allowed"
              : "self-start inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
          }
          onClick={disabled ? undefined : onCta}
          aria-disabled={disabled ? "true" : "false"}
          title={disabled ? (disabledText || "Próximamente") : undefined}
        >
          {cta}
        </button>

        {disabled ? (
          <span className="text-[11px] text-slate-400">
            {disabledText || "Próximamente"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function Inicio() {
  const { user, currentOrg, currentRole } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const roleLabel = (() => {
    const r = (currentRole || "").toLowerCase();
    if (r === "owner") return t("app.header.roleOwner") || "Propietario";
    if (r === "admin") return t("app.header.roleAdmin") || "Administrador";
    if (r === "tracker") return t("app.header.roleTracker") || "Tracker";
    return currentRole || "—";
  })();

  // Rutas de ayuda (ACTIVAS: instrucciones + FAQ + video)
  const helpRoutes = {
    instructions: "/help/instructions",
    faq: "/help/faq",
    video: "/help/video", // ✅ ACTIVO
    soporte: null, // "/help/support"
    queEs: null, // "/help/what-is"
    novedades: null, // "/help/changelog"
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 mb-2">
              {t("inicio.header.badge")}
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 mb-1">
              {t("inicio.header.title")}
            </h1>
            <p className="text-sm text-slate-600 max-w-xl">
              {t("inicio.header.subtitle")}
            </p>
          </div>

          {/* Info de usuario / organización */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 px-3 py-2 text-[11px] text-slate-600 max-w-xs">
            <div className="font-semibold mb-1">
              {t("inicio.userInfo.connectedAs")}{" "}
              <span className="text-slate-900">
                {user?.email || user?.id || "—"}
              </span>
            </div>
            <div className="mb-1">
              {t("inicio.userInfo.withRole")}{" "}
              <span className="font-semibold text-slate-900">{roleLabel}</span>
            </div>
            <div className="mb-1">
              {t("inicio.userInfo.inOrg")}{" "}
              <span className="font-semibold text-slate-900">
                {currentOrg?.nombre || currentOrg?.name || "—"}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-y-1">
              <InfoPill label={t("inicio.userInfo.userLabel")} value={user?.id} />
              <InfoPill
                label={t("inicio.userInfo.orgIdLabel")}
                value={currentOrg?.id}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Tarjetas de recursos / ayuda */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">
          {t("inicio.header.badge")}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Instrucciones (ACTIVO) */}
          <StarterCard
            badge={t("inicio.cards.instrucciones.badge")}
            title={t("inicio.cards.instrucciones.title")}
            body={t("inicio.cards.instrucciones.body")}
            cta={t("inicio.cards.instrucciones.cta")}
            onCta={() => navigate(helpRoutes.instructions)}
            disabled={!helpRoutes.instructions}
          />

          {/* FAQ (ACTIVO) */}
          <StarterCard
            badge={t("inicio.cards.faq.badge")}
            title={t("inicio.cards.faq.title")}
            body={t("inicio.cards.faq.body")}
            cta={t("inicio.cards.faq.cta")}
            onCta={() => navigate(helpRoutes.faq)}
            disabled={!helpRoutes.faq}
          />

          {/* Video demo (ACTIVO) */}
          <StarterCard
            badge={t("inicio.cards.videoDemo.badge")}
            title={t("inicio.cards.videoDemo.title")}
            body={t("inicio.cards.videoDemo.body")}
            cta={t("inicio.cards.videoDemo.cta")}
            onCta={() => helpRoutes.video && navigate(helpRoutes.video)}
            disabled={!helpRoutes.video}
            disabledText={t("inicio.cards.common.soon") || "Próximamente"}
          />

          {/* Soporte (PRÓXIMAMENTE) */}
          <StarterCard
            badge={t("inicio.cards.soporte.badge")}
            title={t("inicio.cards.soporte.title")}
            body={t("inicio.cards.soporte.body")}
            cta={t("inicio.cards.soporte.cta")}
            onCta={() => helpRoutes.soporte && navigate(helpRoutes.soporte)}
            disabled={!helpRoutes.soporte}
            disabledText={t("inicio.cards.common.soon") || "Próximamente"}
          />

          {/* ¿Qué es? (PRÓXIMAMENTE) */}
          <StarterCard
            badge={t("inicio.cards.queEs.badge")}
            title={t("inicio.cards.queEs.title")}
            body={t("inicio.cards.queEs.body")}
            cta={t("inicio.cards.queEs.cta")}
            onCta={() => helpRoutes.queEs && navigate(helpRoutes.queEs)}
            disabled={!helpRoutes.queEs}
            disabledText={t("inicio.cards.common.soon") || "Próximamente"}
          />

          {/* Novedades (PRÓXIMAMENTE) */}
          <StarterCard
            badge={t("inicio.cards.novedades.badge")}
            title={t("inicio.cards.novedades.title")}
            body={t("inicio.cards.novedades.body")}
            cta={t("inicio.cards.novedades.cta")}
            onCta={() => helpRoutes.novedades && navigate(helpRoutes.novedades)}
            disabled={!helpRoutes.novedades}
            disabledText={t("inicio.cards.common.soon") || "Próximamente"}
          />
        </div>
      </section>
    </div>
  );
}
