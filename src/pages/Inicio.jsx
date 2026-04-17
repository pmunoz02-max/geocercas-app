// src/pages/Inicio.jsx
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/auth.js";
import { supabase } from "../lib/supabaseClient.js";
import UpgradeToProButton from "../components/Billing/UpgradeToProButton";

function HelpCard({ title, description, cta, to }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(to)}
      className="
        cursor-pointer
        rounded-2xl
        border border-slate-200
        bg-white
        shadow-sm
        p-6
        hover:shadow-md
        hover:border-slate-300
        transition
      "
    >
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <div className="mt-4 text-sm font-medium text-blue-700">
        {cta}
      </div>
    </div>
  );
}

export default function Inicio() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const { loading, ready, user, role, currentOrgId, authenticated } = useAuth();

  const [signingOut, setSigningOut] = useState(false);

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

      // 1) Sign out supabase (client)
      await supabase.auth.signOut();

      // 2) Intento best-effort de limpiar cookie tg_at (si existe endpoint)
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

      // 3) volver a inicio / login
      navigate("/inicio", { replace: true });
      window.location.reload();
    } finally {
      setSigningOut(false);
    }
  }

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }

  // 1) Loader mientras AuthContext hidrata
  if (loading || !ready) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        {t("home.loadingPermissions")}
      </div>
    );
  }

  // 2) No autenticado → login (botón legible)
  if (!authenticated || !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <h1 className="text-xl font-semibold text-slate-900">
            {t("dashboard.welcome")}
          </h1>

          <p className="mt-2 text-slate-600">
            {t("home.loginToContinue")}
          </p>

          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <button
              className="
                w-full sm:w-auto
                rounded-xl
                bg-blue-600 hover:bg-blue-700
                text-white font-semibold
                px-6 py-3
                shadow-md
                transition
                focus:outline-none focus:ring-2 focus:ring-blue-400
              "
              onClick={() => navigate("/login")}
              type="button"
            >
              {t("home.goToLogin")}
            </button>

            <button
              className="
                w-full sm:w-auto
                rounded-xl
                border border-slate-300
                bg-white hover:bg-slate-50
                text-slate-900 font-medium
                px-6 py-3
                transition
              "
              onClick={() => navigate("/help/instructions")}
              type="button"
            >
              {t("home.quickStart")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3) Rol efectivo
  const roleLower = useMemo(() => String(role || "").toLowerCase().trim(), [role]);

  // 4) Estado anómalo (sesión sin rol u org)
  if (!roleLower || !currentOrgId) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-semibold text-slate-900">
              {t("home.missingContextTitle")}
            </h1>

            <button
              className="
                rounded-xl
                bg-slate-900 hover:bg-slate-800
                text-white font-medium
                px-4 py-2
                transition
                disabled:opacity-60
              "
              onClick={onLogout}
              disabled={signingOut}
              type="button"
              title={t("common.actions.logout")}
            >
              {signingOut
                ? t("common.actions.processing")
                : t("common.actions.logout")}
            </button>
          </div>

          <p className="text-sm text-slate-600">
            {t("home.missingContextBody", {
              correo: user.email,
            })}
          </p>

          <div className="text-sm text-slate-700 space-y-1">
            <div>
              <b>{t("dashboard.email")}:</b> {user.email}
            </div>
            <div>
              <b>{t("home.labels.organization")}</b>{" "}
              {t("home.orgNotResolved")}
            </div>
            <div>
              <b>{t("home.labels.role")}</b>{" "}
              {t("home.roleEmpty")}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition"
              onClick={() => window.location.reload()}
              type="button"
            >
              {t("home.retry")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 5) HOME normal
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      {/* Bienvenida + logout */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {t("dashboard.welcome")}
            </h1>

            <p className="text-slate-600 mt-2">
              {t("dashboard.sessionAs", { role: roleLower })}
            </p>

            <div className="mt-4 text-sm text-slate-700 space-y-1">
              <div>
                <b>{t("dashboard.email")}:</b> {user.email}
              </div>
              <div>
                <b>{t("dashboard.organizationId")}:</b>{" "}
                <span className="font-mono">{currentOrgId}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              className="
                rounded-xl
                border border-slate-300
                bg-white hover:bg-slate-50
                text-slate-900 font-medium
                px-4 py-2
                transition
              "
              onClick={() => navigate("/dashboard")}
              type="button"
            >
              {t("dashboard.goToDashboard")}
            </button>

            <button
              className="
                rounded-xl
                border border-red-300
                bg-white hover:bg-red-50
                text-red-700 font-medium
                px-4 py-2
                transition
              "
              onClick={() => navigate("/settings/delete-account")}
              type="button"
            >
              {t("dashboard.deleteAccount")}
            </button>

            <button
              className="
                rounded-xl
                bg-slate-900 hover:bg-slate-800
                text-white font-medium
                px-4 py-2
                transition
                disabled:opacity-60
              "
              onClick={onLogout}
              disabled={signingOut}
              type="button"
            >
              {signingOut
                ? t("common.actions.processing")
                : t("common.actions.logout")}
            </button>
          </div>
        </div>
      </div>

      {/* ✅ Monetización / Plan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UpgradeToProButton orgId={currentOrgId} getAccessToken={getAccessToken} />
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            {t("dashboard.managePlan")}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {t("inicio.billing.managePlanBody")}
          </p>
          <button
            type="button"
            onClick={() => navigate("/billing")}
            className="
              mt-4
              rounded-xl
              border border-slate-300
              bg-white hover:bg-slate-50
              text-slate-900 font-medium
              px-5 py-3
              transition
            "
          >
            {t("dashboard.subscribePro")}
          </button>
          <div className="mt-3 text-xs text-slate-500">
            {t("inicio.billing.previewNote")}
          </div>
        </div>
      </div>

      {/* Help Center */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          {t("dashboard.helpCenter")}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
      </div>
    </div>
  );
}