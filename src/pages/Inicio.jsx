// src/pages/Inicio.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

function InfoPill({ label, value }) {
  if (!value) return null;
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-600 mr-2">
      <span className="font-semibold">{label}</span>
      <span className="font-mono text-[11px] truncate max-w-[160px]">{value}</span>
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
          disabled={disabled}
          className={
            disabled
              ? "self-start inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-500 cursor-not-allowed"
              : "self-start inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
          }
          onClick={disabled ? undefined : onCta}
          aria-disabled={disabled ? "true" : "false"}
          title={disabled ? disabledText : undefined}
        >
          {cta}
        </button>

        {disabled ? <span className="text-[11px] text-slate-400">{disabledText}</span> : null}
      </div>
    </div>
  );
}

export default function Inicio() {
  const auth = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Compatibilidad hacia atrás:
  // - si authReady no existe todavía en tu AuthContext real, NO dejamos la app colgada
  const authReady = auth?.authReady ?? true;
  const user = auth?.user ?? null;
  const currentOrg = auth?.currentOrg ?? null;
  const trackerDomain = Boolean(auth?.trackerDomain);

  // currentRole (si ya lo expones) -> bestRole -> vacío
  const roleLower = String(auth?.currentRole ?? auth?.bestRole ?? "")
    .toLowerCase()
    .trim();

  const orgs = Array.isArray(auth?.orgs) ? auth.orgs : [];

  // Anti-cuelgue: si pasaron X segundos y aún no hay rol/org, mostramos hint
  const [stuckHint, setStuckHint] = useState(false);
  useEffect(() => {
    const tmr = setTimeout(() => setStuckHint(true), 8000);
    return () => clearTimeout(tmr);
  }, []);

  // 1) Hidratación
  if (!authReady) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        Resolviendo permisos...
      </div>
    );
  }

  // 2) No user (aunque debería estar protegido por AuthGuard)
  if (!user) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-slate-500 px-4 text-center gap-3">
        <div>Inicia sesión para continuar.</div>
        <button
          onClick={() => navigate("/login", { replace: true })}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          Ir a Login
        </button>
      </div>
    );
  }

  // 3) Si aún no hay rol → loader (pero no pantalla blanca)
  if (!roleLower) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-slate-500 px-4 text-center gap-2">
        <div>Resolviendo permisos...</div>
        {stuckHint ? (
          <div className="text-sm text-slate-400">
            Si esto no avanza, recarga la página o vuelve a abrir el Magic Link en el navegador.
          </div>
        ) : null}
      </div>
    );
  }

  // 4) Si es panel y aún no hay org activa → loader con hint
  if (!trackerDomain && !currentOrg) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-slate-600 px-4 text-center gap-2">
        <div className="text-slate-500">Preparando organización…</div>
        <div className="text-sm text-slate-500">
          {orgs.length === 0
            ? "Tu usuario aún no tiene una organización asignada."
            : "Seleccionando organización activa…"}
        </div>
        {stuckHint ? (
          <div className="text-sm text-slate-400">
            Si se queda aquí, revisa que el trigger/roles haya creado org y que RLS permita leerla.
          </div>
        ) : null}
      </div>
    );
  }

  // Etiqueta rol (mantiene i18n si existe)
  const roleLabel = useMemo(() => {
    if (roleLower === "owner") return t("app.header.roleOwner") || "Owner";
    if (roleLower === "admin") return t("app.header.roleAdmin") || "Admin";
    if (roleLower === "viewer") return t("app.header.roleViewer") || "Viewer";
    if (roleLower === "tracker") return t("app.header.roleTracker") || "Tracker";
    return roleLower;
  }, [roleLower, t]);

  // Rutas de ayuda (YA ACTIVAS)
  const helpRoutes = {
    instructions: "/help/instructions",
    faq: "/help/faq",
    soporte: "/help/support",
    novedades: "/help/changelog",
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

            <p className="text-sm text-slate-600">{t("inicio.header.subtitle")}</p>

            <div className="mt-3">
              <InfoPill label="Email:" value={user?.email || user?.id} />
              {!trackerDomain ? (
                <InfoPill
                  label={t("inicio.pills.org") || "Org:"}
                  value={currentOrg?.nombre || currentOrg?.name || currentOrg?.org_name || currentOrg?.id}
                />
              ) : null}
              <InfoPill label={t("inicio.pills.role") || "Rol:"} value={roleLabel} />
              <InfoPill label="Modo:" value={trackerDomain ? "Tracker" : "Panel"} />
            </div>

            {/* Info usuario (se conserva) */}
            <div className="mt-4 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2 text-[11px] text-slate-600 max-w-xs">
              <div className="font-semibold mb-1">
                {t("inicio.userInfo.connectedAs")}{" "}
                <span className="text-slate-900">{user?.email || user?.id}</span>
              </div>
              <div className="mb-1">
                {t("inicio.userInfo.withRole")}{" "}
                <span className="font-semibold text-slate-900">{roleLabel}</span>
              </div>
              {!trackerDomain ? (
                <div className="mb-1">
                  {t("inicio.userInfo.inOrg")}{" "}
                  <span className="font-semibold text-slate-900">
                    {currentOrg?.nombre || currentOrg?.name || currentOrg?.org_name || currentOrg?.id}
                  </span>
                </div>
              ) : null}
              <div className="mt-1 flex flex-wrap gap-y-1">
                <InfoPill label="User" value={user?.id} />
                {!trackerDomain ? <InfoPill label="Org" value={currentOrg?.id} /> : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Centro de ayuda */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">{t("inicio.section.quickStart")}</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <StarterCard
            badge={t("inicio.cards.instructions.badge")}
            title={t("inicio.cards.instructions.title")}
            body={t("inicio.cards.instructions.body")}
            cta={t("inicio.cards.instructions.cta")}
            onCta={() => navigate(helpRoutes.instructions)}
          />

          <StarterCard
            badge={t("inicio.cards.faq.badge")}
            title={t("inicio.cards.faq.title")}
            body={t("inicio.cards.faq.body")}
            cta={t("inicio.cards.faq.cta")}
            onCta={() => navigate(helpRoutes.faq)}
          />

          <StarterCard
            badge={t("inicio.cards.soporte.badge")}
            title={t("inicio.cards.soporte.title")}
            body={t("inicio.cards.soporte.body")}
            cta={t("inicio.cards.soporte.cta")}
            onCta={() => navigate(helpRoutes.soporte)}
          />

          <StarterCard
            badge={t("inicio.cards.novedades.badge")}
            title={t("inicio.cards.novedades.title")}
            body={t("inicio.cards.novedades.body")}
            cta={t("inicio.cards.novedades.cta")}
            onCta={() => navigate(helpRoutes.novedades)}
          />
        </div>
      </section>

      {/* Acciones base rápidas (no rompen UI, pero ayudan a testear navegación) */}
      <section className="flex flex-wrap gap-3">
        {!trackerDomain ? (
          <button
            onClick={() => navigate("/geocercas")}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Ir a Geocercas
          </button>
        ) : null}

        {trackerDomain ? (
          <button
            onClick={() => navigate("/tracker-gps")}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            Abrir Tracker
          </button>
        ) : null}
      </section>
    </div>
  );
}
