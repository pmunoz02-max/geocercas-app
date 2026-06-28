// src/pages/Inicio.jsx
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/auth.js";
import { supabase } from "../lib/supabaseClient.js";
import UpgradeToProButton from "@/components/Billing/UpgradeToProButton";
import useOrgEntitlements from "@/hooks/useOrgEntitlements";

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-60";

const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-2xl border border-emerald-200 bg-white/90 px-5 py-3 text-sm font-semibold text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60";

const dangerButtonClass =
  "inline-flex items-center justify-center rounded-2xl border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-60";

function HelpCard({ title, description, cta, to }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      type="button"
      className="group h-full cursor-pointer rounded-3xl border border-emerald-100 bg-white p-6 text-left shadow-sm shadow-emerald-900/5 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-900/10"
    >
      <div className="flex h-full flex-col">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-lg font-bold text-emerald-700 ring-1 ring-emerald-100">
          {String(title || "?").slice(0, 1).toUpperCase()}
        </div>
        <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
        <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{description}</p>
        <div className="mt-5 inline-flex items-center text-sm font-semibold text-emerald-700 transition group-hover:text-emerald-800">
          {cta}
        </div>
      </div>
    </button>
  );
}

function PageHero({ badge, title, subtitle, children }) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-emerald-200 bg-gradient-to-br from-emerald-700 via-teal-600 to-cyan-600 p-7 text-white shadow-2xl shadow-emerald-900/20 sm:p-8">
      <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/20 blur-3xl" />
      <div className="absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-emerald-200/20 blur-3xl" />
      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          {badge ? (
            <div className="mb-4 inline-flex rounded-full border border-white/25 bg-white/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-50 backdrop-blur">
              {badge}
            </div>
          ) : null}
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          {subtitle ? (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/90 sm:text-base">
              {subtitle}
            </p>
          ) : null}
        </div>
        {children ? (
          <div className="rounded-3xl border border-white/20 bg-white/15 p-4 backdrop-blur">
            {children}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function InfoPanel({ children, className = "" }) {
  return (
    <section
      className={`rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-900/5 ${className}`}
    >
      {children}
    </section>
  );
}

export default function Inicio() {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const isPreviewEnv =
    hostname === "preview.tugeocercas.com" || hostname.endsWith(".vercel.app");

  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const { loading, ready, user, role, currentOrgId, authenticated } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const roleLower = useMemo(() => String(role || "").toLowerCase().trim(), [role]);

  const helpCards = useMemo(
    () => [
      {
        title: t("dashboard.help.quickGuide.title"),
        description: t("dashboard.help.quickGuide.desc"),
        cta: t("common.openArrow"),
        to: "/help/instructions",
      },
      {
        title: t("dashboard.help.faq.title"),
        description: t("dashboard.help.faq.desc"),
        cta: t("common.openArrow"),
        to: "/help/faq",
      },
      {
        title: t("dashboard.help.support.title"),
        description: t("dashboard.help.support.desc"),
        cta: t("common.openArrow"),
        to: "/help/support",
      },
      {
        title: t("dashboard.help.updates.title"),
        description: t("dashboard.help.updates.desc"),
        cta: t("common.openArrow"),
        to: "/help/changelog",
      },
    ],
    [t, i18n.language]
  );

  async function onLogout() {
    try {
      setSigningOut(true);

      await supabase.auth.signOut();

      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      } catch {
        // no-op
      }

      navigate("/inicio", { replace: true });
      window.location.reload();
    } finally {
      setSigningOut(false);
    }
  }

  if (loading || !ready) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-6 py-10">
        <InfoPanel className="max-w-xl text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-pulse rounded-2xl bg-emerald-100" />
          <p className="text-sm font-medium text-slate-600">{t("home.loadingPermissions")}</p>
        </InfoPanel>
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-10">
        <PageHero
          badge={t("home.startBadge", { defaultValue: "GeoField GPS" })}
          title={t("dashboard.welcome")}
          subtitle={t("home.loginToContinue")}
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <button className={primaryButtonClass} onClick={() => navigate("/login")} type="button">
              {t("home.goToLogin")}
            </button>
            <button className={secondaryButtonClass} onClick={() => navigate("/help/instructions")} type="button">
              {t("home.quickStart")}
            </button>
          </div>
        </PageHero>
      </div>
    );
  }

  if (!roleLower || !currentOrgId) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-10 space-y-6">
        <PageHero
          badge={t("home.accountStatusBadge", { defaultValue: "Estado de cuenta" })}
          title={t("home.missingContextTitle", { defaultValue: "Cuenta creada correctamente" })}
          subtitle={t("home.missingContextBody", {
            defaultValue: "Tu cuenta ya existe, pero todavía no está vinculada a una organización.",
          })}
        />

        <InfoPanel className="max-w-3xl space-y-6">
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
            <p className="font-semibold">
              {t("home.trackerWaitingTitle", { defaultValue: "Si eres tracker" })}
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 leading-6">
              <li>{t("home.trackerWaitingStep1", { defaultValue: "Avisa al administrador que ya creaste tu cuenta." })}</li>
              <li>{t("home.trackerWaitingStep2", { defaultValue: "Espera el enlace de invitación." })}</li>
              <li>{t("home.trackerWaitingStep3", { defaultValue: "Abre el enlace desde este mismo teléfono." })}</li>
              <li>{t("home.trackerWaitingStep4", { defaultValue: "Después podrás usar el tracking GPS." })}</li>
            </ol>
            <div className="mt-5">
              <button
                className={primaryButtonClass}
                onClick={() => window.location.assign("/tracker-install")}
                type="button"
              >
                {t("home.installTrackerAppCta", { defaultValue: "Instalar app para tracking GPS" })}
              </button>
            </div>
          </div>

          <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                {t("dashboard.email", { defaultValue: "Correo" })}
              </p>
              <p className="mt-1 break-words font-medium text-slate-900">soporte@tugeocercas.com</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                {t("dashboard.organizationId", { defaultValue: "Organización" })}
              </p>
              <p className="mt-1 font-medium text-slate-900">
                {t("home.pendingInvitation", { defaultValue: "Pendiente de invitación" })}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                {t("dashboard.role", { defaultValue: "Rol" })}
              </p>
              <p className="mt-1 font-medium text-slate-900">
                {t("home.pending", { defaultValue: "Pendiente" })}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <button className={primaryButtonClass} onClick={() => window.location.reload()} type="button">
              {t("home.retry", { defaultValue: "Revisar nuevamente" })}
            </button>
            <button className={secondaryButtonClass} onClick={onLogout} disabled={signingOut} type="button">
              {signingOut
                ? t("common.actions.processing", { defaultValue: "Procesando…" })
                : t("common.actions.logout", { defaultValue: "Cerrar sesión" })}
            </button>
          </div>
        </InfoPanel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 space-y-8">
      {isPreviewEnv && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {t("home.previewEnvironment", { defaultValue: "Estás revisando un deployment Preview." })}
        </div>
      )}

      <PageHero
        badge={t("home.startBadge", { defaultValue: "Inicio" })}
        title={t("dashboard.welcome")}
        subtitle={t("dashboard.sessionAs", { role: roleLower })}
      >
        <div className="grid gap-3 text-sm sm:min-w-[320px]">
          <div className="rounded-2xl border border-white/20 bg-white/15 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-50/80">
              {t("dashboard.email")}
            </p>
            <p className="mt-1 break-all font-semibold text-white">{user.email}</p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/15 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-50/80">
              {t("dashboard.organizationId")}
            </p>
            <p className="mt-1 break-all font-mono text-xs font-semibold text-white">{currentOrgId}</p>
          </div>
        </div>
      </PageHero>

      <InfoPanel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              {t("home.quickActions", { defaultValue: "Acciones rápidas" })}
            </p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">
              {t("home.manageWorkspace", { defaultValue: "Gestiona tu espacio de trabajo" })}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {t("home.manageWorkspaceDesc", {
                defaultValue:
                  "Accede al panel principal, revisa tu plan o administra la cuenta desde un solo lugar.",
              })}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button className={secondaryButtonClass} onClick={() => navigate("/dashboard")} type="button">
              {t("dashboard.goToDashboard")}
            </button>
            <button className={dangerButtonClass} onClick={() => navigate("/settings/delete-account")} type="button">
              {t("dashboard.deleteAccount")}
            </button>
            <button className={primaryButtonClass} onClick={onLogout} disabled={signingOut} type="button">
              {signingOut ? t("common.actions.processing") : t("common.actions.logout")}
            </button>
          </div>
        </div>
      </InfoPanel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InfoPanel>
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              {t("dashboard.managePlan")}
            </p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">
              {t("home.subscriptionSummary", { defaultValue: "Resumen del plan" })}
            </h2>
          </div>
          <PlanSection currentOrgId={currentOrgId} />
        </InfoPanel>

        <InfoPanel>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            {t("dashboard.helpCenter")}
          </p>
          <h2 className="mt-2 text-xl font-bold text-slate-950">
            {t("home.helpCenterTitle", { defaultValue: "Ayuda y aprendizaje" })}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("home.helpCenterDesc", {
              defaultValue: "Encuentra guías rápidas, preguntas frecuentes, soporte y novedades del sistema.",
            })}
          </p>
        </InfoPanel>
      </div>

      <section>
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              {t("dashboard.helpCenter")}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              {t("home.quickGuideCards", { defaultValue: "Centro de Ayuda" })}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {helpCards.map((card) => (
            <HelpCard
              key={card.to}
              title={card.title}
              description={card.description}
              cta={card.cta}
              to={card.to}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function PlanSection({ currentOrgId }) {
  const { t } = useTranslation();
  const { entitlements, planCode, loading: entitlementsLoading } = useOrgEntitlements();

  const currentPlan = String(
    entitlements?.effective_plan_code ||
      entitlements?.plan_code ||
      entitlements?.billing_plan_code ||
      planCode ||
      "free"
  ).toLowerCase();

  const planLabel =
    currentPlan === "enterprise"
      ? t("dashboard.planEnterprise", { defaultValue: "Enterprise" })
      : currentPlan === "pro"
      ? t("dashboard.planPro", { defaultValue: "Pro" })
      : currentPlan === "starter"
      ? t("dashboard.planStarter", { defaultValue: "Starter" })
      : t("dashboard.planFree", { defaultValue: "Free" });

  const nextPlan = currentPlan === "pro" ? "enterprise" : "pro";
  const canUpgrade = currentPlan !== "enterprise";

  if (entitlementsLoading) {
    return (
      <div className="mt-2 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm font-medium text-slate-600">
        {t("dashboard.loadingPlan", { defaultValue: "Cargando información de plan…" })}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-slate-700">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          {t("dashboard.currentPlan", { defaultValue: "Current plan" })}
        </p>
        <p className="mt-1 text-2xl font-bold text-slate-950">{planLabel}</p>
      </div>

      {canUpgrade ? (
        <UpgradeToProButton
          orgId={currentOrgId}
          plan={nextPlan}
          className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-700"
          label={
            nextPlan === "enterprise"
              ? t("dashboard.subscribeEnterprise", { defaultValue: "Subscribe to Enterprise" })
              : t("dashboard.subscribePro", { defaultValue: "Subscribe to PRO" })
          }
        />
      ) : (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {t("dashboard.maxPlanEnterprise", {
            defaultValue: "Your organization already has the maximum plan (Enterprise).",
          })}
        </div>
      )}
    </div>
  );
}
