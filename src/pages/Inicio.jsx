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

  // NUEVOS CARDS: solo información / ayuda
  const cards = [
    {
      key: "instrucciones",
      route: "/inicio#instrucciones",
      badgeKey: "inicio.cards.instrucciones.badge",
      titleKey: "inicio.cards.instrucciones.title",
      bodyKey: "inicio.cards.instrucciones.body",
      ctaKey: "inicio.cards.instrucciones.cta",
      accent: "emerald",
    },
    {
      key: "faq",
      route: "/inicio#faq",
      badgeKey: "inicio.cards.faq.badge",
      titleKey: "inicio.cards.faq.title",
      bodyKey: "inicio.cards.faq.body",
      ctaKey: "inicio.cards.faq.cta",
      accent: "sky",
    },
    {
      key: "videoDemo",
      route: "/inicio#video-demo",
      badgeKey: "inicio.cards.videoDemo.badge",
      titleKey: "inicio.cards.videoDemo.title",
      bodyKey: "inicio.cards.videoDemo.body",
      ctaKey: "inicio.cards.videoDemo.cta",
      accent: "amber",
    },
    {
      key: "soporte",
      route: "/inicio#soporte",
      badgeKey: "inicio.cards.soporte.badge",
      titleKey: "inicio.cards.soporte.title",
      bodyKey: "inicio.cards.soporte.body",
      ctaKey: "inicio.cards.soporte.cta",
      accent: "violet",
    },
    {
      key: "queEs",
      route: "/inicio#que-es",
      badgeKey: "inicio.cards.queEs.badge",
      titleKey: "inicio.cards.queEs.title",
      bodyKey: "inicio.cards.queEs.body",
      ctaKey: "inicio.cards.queEs.cta",
      accent: "indigo",
    },
    {
      key: "novedades",
      route: "/inicio#novedades",
      badgeKey: "inicio.cards.novedades.badge",
      titleKey: "inicio.cards.novedades.title",
      bodyKey: "inicio.cards.novedades.body",
      ctaKey: "inicio.cards.novedades.cta",
      accent: "cyan",
    }
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

        {/* Tarjetas de información / ayuda */}
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const accent = accentClasses[card.accent] ?? accentClasses.emerald;
            return (
              <article
                key={card.key}
                className={`group relative overflow-hidden rounded-2xl border bg-white shadow-sm hover:shadow-lg transition-all duration-200 ${accent.border} ${accent.hoverBorder}`}
              >
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
