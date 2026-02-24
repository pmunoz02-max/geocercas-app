// src/components/Header.jsx
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";

function NavItem({ to, children }) {
  const base =
    "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full " +
    "text-sm font-semibold whitespace-nowrap border transition-all duration-150 " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

  const active =
    "bg-slate-900 text-white border-slate-900 shadow-sm shadow-emerald-500/10";

  const inactive =
    "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 hover:shadow-sm";

  return (
    <NavLink
      to={to}
      className={({ isActive }) => (isActive ? `${base} ${active}` : `${base} ${inactive}`)}
    >
      {({ isActive }) => (
        <>
          <span
            className={`h-2 w-2 rounded-full ${
              isActive ? "bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]" : "bg-slate-300"
            }`}
          />
          <span>{children}</span>
        </>
      )}
    </NavLink>
  );
}

export default function Header() {
  const { t } = useTranslation();
  const { user, loading, currentOrg, currentRole, isAppRoot, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const roleLabel = isAppRoot
    ? t("common.roles.root")
    : currentRole
    ? String(currentRole).toUpperCase()
    : t("common.roles.noRole");

  const handleLogout = async () => {
    await logout();
    if (location.pathname !== "/login") {
      navigate("/login", { replace: true });
    }
  };

  return (
    <header className="w-full border-b bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Link to="/inicio" className="text-lg font-semibold text-slate-900">
            {t("app.brand")}
          </Link>

          {user && (
            <nav className="hidden md:flex items-center gap-2">
              <NavItem to="/inicio">{t("app.tabs.inicio")}</NavItem>
              <NavItem to="/geocerca">{t("app.tabs.geocerca", { defaultValue: t("app.tabs.geocercas") })}</NavItem>
              <NavItem to="/personal">{t("app.tabs.personal")}</NavItem>
              <NavItem to="/actividades">{t("app.tabs.actividades")}</NavItem>
              <NavItem to="/asignaciones">{t("app.tabs.asignaciones")}</NavItem>
              <NavItem to="/reportes">{t("app.tabs.reportes")}</NavItem>
              <NavItem to="/tracker">{t("app.tabs.tracker")}</NavItem>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!loading && user ? (
            <>
              <div className="hidden sm:flex flex-col text-right text-xs px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-medium text-slate-800">
                  {currentOrg?.name ?? t("common.fallbacks.noOrg")}
                </span>
                <span className="text-slate-600">{roleLabel}</span>
              </div>

              <button
                onClick={handleLogout}
                className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold border border-slate-900 hover:bg-slate-800 transition"
              >
                {t("app.header.logout")}
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold border border-slate-900 hover:bg-slate-800 transition"
            >
              {t("app.header.login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

