// src/pages/Dashboard.jsx
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import WelcomeBanner from "../components/WelcomeBanner";
import { useAuth } from "@/context/auth.js";

function roleRank(r) {
  const s = String(r || "").toLowerCase();
  if (s === "owner") return 4;
  if (s === "admin") return 3;
  if (s === "viewer") return 2;
  if (s === "tracker") return 1;
  if (s === "member") return 0;
  return -1;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const tr = (key, fallback, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  const { authReady, orgsReady, currentOrg, bestRole, currentRole, trackerDomain } = useAuth();

  const effectiveRole = useMemo(() => {
    const a = String(currentRole || "").toLowerCase();
    const b = String(bestRole || "").toLowerCase();
    if (roleRank(a) >= roleRank(b)) return a || b || null;
    return b || a || null;
  }, [bestRole, currentRole]);

  const isAdmin = effectiveRole === "admin" || effectiveRole === "owner";
  const isTracker = trackerDomain || effectiveRole === "tracker";

  if (!authReady || !orgsReady) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <section className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-lg shadow-emerald-950/5">
            <p className="text-sm text-gray-600">
              {tr(
                "dashboard.states.loadingContext",
                "Loading your session and current organization…"
              )}
            </p>
          </section>
        </div>
      </div>
    );
  }

  if (isTracker && !currentOrg) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <WelcomeBanner />
          <main className="mt-6">
            <section className="rounded-3xl border border-emerald-100 bg-white p-6 mb-6 shadow-lg shadow-emerald-950/5">
              <h2 className="text-lg font-semibold mb-2">
                {tr("dashboard.trackerActions.title", "Tracker actions")}
              </h2>
              <div className="flex flex-wrap gap-3">
                <Link
                  className="text-sm border rounded px-3 py-2 hover:bg-emerald-50"
                  to="/tracker/enviar-ubicacion"
                >
                  {tr("dashboard.trackerActions.sendLocation", "Send location")}
                </Link>
                <Link
                  className="text-sm border rounded px-3 py-2 hover:bg-emerald-50"
                  to="/tracker/historial"
                >
                  {tr("dashboard.trackerActions.viewHistory", "View history")}
                </Link>
              </div>
            </section>
          </main>
        </div>
      </div>
    );
  }

  if (!currentOrg) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <WelcomeBanner />
          <main className="mt-6">
            <section className="rounded-xl border border-red-200 bg-red-50 p-6">
              <h2 className="text-lg font-semibold mb-2 text-red-700">
                {tr("dashboard.errors.noActiveOrgTitle", "There is no active organization")}
              </h2>
              <p className="text-sm text-red-700">
                {tr(
                  "dashboard.errors.noActiveOrgBody",
                  "Your user does not have an assigned organization. Contact the administrator or sign in again."
                )}
              </p>
            </section>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">

      <section className="relative overflow-hidden rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-emerald-950 via-emerald-800 to-teal-700 px-5 py-6 text-white shadow-xl shadow-emerald-950/15 md:px-7 md:py-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-lime-200/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50">
              {tr("dashboard.heroEyebrow", "Panel principal")}
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                {tr("dashboard.title", "Dashboard")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/90">
                {tr("dashboard.heroSubtitle", "Accede rápidamente a los módulos operativos y revisa tu organización activa.")}
              </p>
            </div>
          </div>
        </div>
      </section>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <WelcomeBanner />

        <div className="mt-2 text-xs text-gray-500">
          {tr("dashboard.currentOrg", "Current organization")}:{" "}
          <span className="font-medium">{currentOrg?.name || currentOrg?.id}</span>
          {effectiveRole ? (
            <>
              {" "}
              · {tr("dashboard.currentRole", "Role")}:{" "}
              <span className="font-medium">{effectiveRole.toUpperCase()}</span>
            </>
          ) : null}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 pb-10">
        <section className="rounded-3xl border border-emerald-100 bg-white p-6 mb-6 shadow-lg shadow-emerald-950/5">
          <h2 className="text-lg font-semibold mb-2">
            {tr("dashboard.generalAccess.title", "General access")}
          </h2>
          <p className="text-sm text-gray-600">
            {tr(
              "dashboard.generalAccess.description",
              "Welcome to the main dashboard. Here you have quick access and diagnostics."
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link className="text-sm border rounded px-3 py-2 hover:bg-emerald-50" to="/whoami">
              {tr("dashboard.generalAccess.whoami", "Diagnostics (WhoAmI)")}
            </Link>
            <Link className="text-sm border rounded px-3 py-2 hover:bg-emerald-50" to="/mapa">
              {tr("dashboard.generalAccess.goToMap", "Go to map")}
            </Link>
          </div>
        </section>

        {isAdmin && (
          <section className="rounded-3xl border border-emerald-100 bg-white p-6 mb-6 shadow-lg shadow-emerald-950/5">
            <h2 className="text-lg font-semibold mb-2">
              {tr("dashboard.adminTools.title", "Administrator tools")}
            </h2>
            <ul className="list-disc pl-5 text-sm leading-6">
              <li>
                {tr("dashboard.adminTools.usersAndRoles", "User and role management")}{" "}
                <Link className="underline" to="/admin/usuarios">
                  {tr("dashboard.actions.open", "Open")}
                </Link>
              </li>
              <li>
                {tr("dashboard.adminTools.policiesAndAudit", "Policies and audit")}{" "}
                <Link className="underline" to="/admin/politicas">
                  {tr("dashboard.actions.open", "Open")}
                </Link>
              </li>
              <li>
                {tr("dashboard.adminTools.reportsAndDownloads", "Reports and downloads")}{" "}
                <Link className="underline" to="/admin/reportes">
                  {tr("dashboard.actions.open", "Open")}
                </Link>
              </li>
            </ul>
          </section>
        )}

        {!isAdmin && (
          <section className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-lg shadow-emerald-950/5">
            <h2 className="text-lg font-semibold mb-2">
              {tr("dashboard.yourAccess.title", "Your access")}
            </h2>
            <p className="text-sm text-gray-600">
              {tr("dashboard.yourAccess.descriptionPrefix", "Your current role is")}{" "}
              <span className="font-medium">
                {effectiveRole
                  ? effectiveRole.toUpperCase()
                  : tr("dashboard.yourAccess.noRole", "NO ROLE")}
              </span>
              .{" "}
              {tr(
                "dashboard.yourAccess.descriptionSuffix",
                "If you need access to additional modules, contact your organization administrator."
              )}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}