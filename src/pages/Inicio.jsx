// src/pages/Inicio.jsx
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function HelpCard({ title, description, to }) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(to)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") navigate(to);
      }}
      className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300"
    >
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <div className="mt-4 text-sm font-medium text-blue-600">
        {t("home.open")}
      </div>
    </div>
  );
}

export default function Inicio() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loading, user, role, currentOrg, isAuthenticated } = useAuth();

  const roleLower = useMemo(() => String(role || "").toLowerCase(), [role]);

  // 1) Esperar SOLO el boot auth
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-500">
        {t("home.loadingPermissions")}
      </div>
    );
  }

  // 2) No autenticado
  if (!isAuthenticated || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-slate-600">
        <span>{t("home.loginToContinue")}</span>
        <button
          className="rounded-lg bg-blue-600 px-3 py-2 text-white"
          onClick={() => navigate("/login")}
          type="button"
        >
          {t("home.goToLogin")}
        </button>
      </div>
    );
  }

  // 3) Contexto incompleto (pero NO spinner infinito)
  if (!roleLower || !currentOrg?.id) {
    return (
      <div className="mx-auto max-w-xl px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">
            {t("home.missingContextTitle")}
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            {t("home.missingContextBody", {
              email: user?.email || "",
            })}
          </p>

          <div className="mt-3 space-y-1 text-sm text-slate-600">
            <div>
              {t("home.labels.email")} <b>{user?.email}</b>
            </div>
            <div>
              {t("home.labels.role")}{" "}
              <b>{roleLower || t("home.roleEmpty")}</b>
            </div>
            <div>
              {t("home.labels.organization")}{" "}
              <b>{currentOrg?.name || t("home.orgNotResolved")}</b>
            </div>
            <div>
              {t("home.labels.orgId")} <b>{currentOrg?.id || "—"}</b>
            </div>
          </div>

          <button
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-white"
            onClick={() => window.location.reload()}
            type="button"
          >
            {t("home.retry")}
          </button>
        </div>
      </div>
    );
  }

  // 4) HOME OK
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">{t("home.welcome")}</h1>

        <p className="mt-2 text-slate-600">
          {t("home.sessionAs")} <b>{roleLower}</b>
        </p>

        <div className="mt-4 text-sm text-slate-700 space-y-1">
          <div>
            {t("home.labels.email")} {user?.email}
          </div>
          <div>
            {t("home.labels.organization")} {currentOrg?.name}
          </div>
          <div>
            {t("home.labels.orgId")} {currentOrg?.id}
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold">{t("home.help.title")}</h2>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <HelpCard
            title={t("home.help.quick")}
            description={t("home.help.quickDesc")}
            to="/help/instructions"
          />
          <HelpCard
            title={t("home.help.faq")}
            description={t("home.help.faqDesc")}
            to="/help/faq"
          />
          <HelpCard
            title={t("home.help.support")}
            description={t("home.help.supportDesc")}
            to="/help/support"
          />
          <HelpCard
            title={t("home.help.news")}
            description={t("home.help.newsDesc")}
            to="/help/changelog"
          />
        </div>
      </div>
    </div>
  );
}
