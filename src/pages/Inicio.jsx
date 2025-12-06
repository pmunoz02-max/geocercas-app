// src/pages/Inicio.jsx
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";

export default function Inicio() {
  const { user, profile, currentOrg, currentRole } = useAuth();
  const { t } = useTranslation();

  const userEmail = user?.email || "";
  const roleLabel = (currentRole || "—").toUpperCase();
  const orgName = currentOrg?.name || "—";
  const orgId = currentOrg?.id || "—";
  const profileName =
    profile?.full_name || profile?.nombre || profile?.name || "";

  // Definición de tarjetas: solo guardamos las KEYS aquí
  const cards = [
    {
      key: "nueva",
      route: "/nueva-geocerca",
      badgeKey: "inicio.cards.nueva.badge",
      titleKey: "inicio.cards.nueva.title",
      bodyKey: "inicio.cards.nueva.body",
      ctaKey: "inicio.cards.nueva.cta",
      accent: "emerald",
    },
    {
      key: "geocercas",
      route: "/geocercas",
      badgeKey: "inicio.cards.geocercas.badge",
      titleKey: "inicio.cards.geocercas.title",
      bodyKey: "inicio.cards.geocercas.body",
      ctaKey: "inicio.cards.geocercas.cta",
      accent: "emerald",
    },
    {
      key: "personal",
      route: "/personal",
      badgeKey: "inicio.cards.personal.badge",
      titleKey: "inicio.cards.personal.title",
      bodyKey: "inicio.cards.personal.body",
      ctaKey: "inicio.cards.personal.cta",
      accent: "sky",
    },
    {
      key: "actividades",
      route: "/actividades",
      badgeKey: "inicio.cards.actividades.badge",
      titleKey: "inicio.cards.actividades.title",
      bodyKey: "inicio.cards.actividades.body",
      ctaKey: "inicio.cards.actividades.cta",
      accent: "amber",
    },
    {
      key: "asignaciones",
      route: "/asignaciones",
      badgeKey: "inicio.cards.asignaciones.badge",
      titleKey: "inicio.cards.asignaciones.title",
      bodyKey: "inicio.cards.asignaciones.body",
      ctaKey: "inicio.cards.asignaciones.cta",
      accent: "violet",
    },
    {
      key: "reportes",
      route: "/costos",
      badgeKey: "inicio.cards.reportes.badge",
      titleKey: "inicio.cards.reportes.title",
      bodyKey: "inicio.cards.reportes.body",
      ctaKey: "inicio.cards.reportes.cta",
      accent: "emerald",
    },
    {
      key: "dashboardCostos",
      route: "/costos-dashboard",
      badgeKey: "inicio.cards.dashboardCostos.badge",
      titleKey: "inicio.cards.dashboardCostos.title",
      bodyKey: "inicio.cards.dashboardCostos.body",
      ctaKey: "inicio.cards.dashboardCostos.cta",
      accent: "indigo",
    },
    {
      key: "tracker",
      route: "/tracker-dashboard",
      badgeKey: "inicio.cards.tracker.badge",
      titleKey: "inicio.cards.tracker.title",
      bodyKey: "inicio.cards.tracker.body",
      ctaKey: "inicio.cards.tracker.cta",
      accent: "cyan",
    },
    {
      key: "invitarTracker",
      route: "/invitar-tracker",
      badgeKey: "inicio.cards.invitarTracker.badge",
      titleKey: "inicio.cards.invitarTracker.title",
      bodyKey: "inicio.cards.invitarTracker.body",
      ctaKey: "inicio.cards.invitarTracker.cta",
      accent: "emerald",
    },
    {
      key: "admins",
      route: "/admins",
      badgeKey: "inicio.cards.admins.badge",
      titleKey: "inicio.cards.admins.title",
      bodyKey: "inicio.cards.admins.body",
      ctaKey: "inicio.cards.admins.cta",
      accent: "amber",
    },
  ];

  const accentClasses = {
    emerald: {
      badgeBg: "bg-emerald-100 text-emerald-700",
      badgeBorder: "border-emerald-200",
      halo: "from-emerald-100/70 via-transparent to-transparent",
      border: "border-emerald-100",
      hoverBorder: "group-hover:border-emerald-300",
    },
    sky: {
      badgeBg: "bg-sky-100 text-sky-700",
      badgeBorder: "border-sky-200",
      halo: "from-sky-100/70 via-transparent to-transparent",
      border: "border-sky-100",
      hoverBorder: "group-hover:border-sky-300",
    },
    amber: {
      badgeBg: "bg-amber-100 text-amber-800",
      badgeBorder: "border-amber-200",
      halo: "from-amber-100/70 via-transparent to-transparent",
      border: "border-amber-100",
      hoverBorder: "group-hover:border-amber-300",
    },
    violet: {
      badgeBg: "bg-violet-100 text-violet-800",
      badgeBorder: "border-violet-200",
      halo: "from-violet-100/70 via-transparent to-transparent",
      border: "border-violet-100",
      hoverBorder: "group-hover:border-violet-300",
    },
    indigo: {
      badgeBg: "bg-indigo-100 text-indigo-800",
      badgeBorder: "border-indigo-200",
      halo: "from-indigo-100/70 via-transparent to-transparent",
      border: "border-indigo-100",
      hoverBorder: "group-hover:border-indigo-300",
    },
    cyan: {
      badgeBg: "bg-cyan-100 text-cyan-800",
      badgeBorder: "border-cyan-200",
      halo: "from-cyan-100/70 via-transparent to-transparent",
      border: "border-cyan-100",
      hoverBorder: "group-hover:border-cyan-300",
    },
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <main className="max-w-6xl mx-auto px-4 pb-10 pt-6 space-y-8">
        {/* Encabezado */}
        <section className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 border border-emerald-100 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{t("inicio.header.badge")}</span>
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">
              {t("inicio.header.title")}
            </h1>
            <p className="text-sm md:text-base text-slate-600 max-w-2xl">
              {t("inicio.header.subtitle")}
            </p>
          </div>
        </section>

        {/* Tarjetas principales */}
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const accent = accentClasses[card.accent] ?? accentClasses.emerald;
            return (
              <article
                key={card.key}
                className={`group relative overflow-hidden rounded-2xl border bg-white shadow-sm hover:shadow-lg transition-all duration-200 ${accent.border} ${accent.hoverBorder}`}
              >
                {/* Halo */}
                <div
                  className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent.halo} opacity-0 group-hover:opacity-100 transition-opacity duration-200`}
                />
                <div className="relative flex flex-col justify-between h-full">
                  <div className="space-y-3 p-4 pb-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${accent.badgeBg} ${accent.badgeBorder}`}
                    >
                      {t(card.badgeKey)}
                    </span>
                    <div className="space-y-1.5">
                      <h2 className="text-base md:text-[17px] font-semibold text-slate-900">
                        {t(card.titleKey)}
                      </h2>
                      <p className="text-xs md:text-[13px] text-slate-600">
                        {t(card.bodyKey)}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 flex justify-between items-center">
                    <Link
                      to={card.route}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-600 inline-flex items-center gap-1"
                    >
                      <span>{t(card.ctaKey)}</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {/* Info de usuario / organización */}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="text-xs md:text-sm text-slate-600">
            <p>
              {t("inicio.userInfo.connectedAs")}{" "}
              <span className="font-semibold text-slate-900">
                {userEmail || "—"}
              </span>{" "}
              {t("inicio.userInfo.withRole")}{" "}
              <span className="font-semibold text-slate-900">{roleLabel}</span>{" "}
              {t("inicio.userInfo.inOrg")}{" "}
              <span className="font-semibold text-slate-900">
                {orgName || "—"}
              </span>
              .
            </p>
          </div>

          <div className="text-[11px] md:text-xs text-slate-500 space-y-1 md:text-right">
            {profileName && (
              <p>
                {t("inicio.userInfo.userLabel")}{" "}
                <span className="font-semibold text-slate-900">
                  {profileName}
                </span>
              </p>
            )}
            <p>
              {t("inicio.userInfo.orgIdLabel")}{" "}
              <span className="font-mono text-slate-800">{orgId}</span>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
