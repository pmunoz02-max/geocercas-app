import React from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";

function NavItem({ to, children }) {
  const base =
    "px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100 transition-colors whitespace-nowrap";
  const active = "bg-gray-900 text-white hover:bg-gray-900";
  const inactive = "text-gray-700";

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        isActive ? `${base} ${active}` : `${base} ${inactive}`
      }
    >
      {children}
    </NavLink>
  );
}

function LangButton({ lng, label, current, onClick }) {
  const isActive = current === lng;
  return (
    <button
      type="button"
      onClick={() => onClick(lng)}
      className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
        isActive ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
      }`}
      aria-pressed={isActive}
    >
      {label}
    </button>
  );
}

export default function Header() {
  const { t, i18n } = useTranslation();
  const {
    user,
    loading,
    currentOrg,
    role, // puede venir null/undefined
    signOut,
    isAuthenticated,
  } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await signOut();
    if (location.pathname !== "/login") {
      navigate("/login", { replace: true });
    }
  };

  const setLang = (lng) => {
    i18n.changeLanguage(lng);
    try {
      localStorage.setItem("i18nextLng", lng);
      document.documentElement.lang = lng;
    } catch {}
  };

  const lang = (i18n.language || "en").slice(0, 2);

  // 🔐 Rol a mostrar (robusto)
  let displayRole = t("common.actions.loading", { defaultValue: "Loading…" });

  if (!loading) {
    if (!currentOrg) {
      displayRole = t("app.header.organizationNone", { defaultValue: "No organization" });
    } else if (role) {
      const r = String(role).toLowerCase();
      if (r === "owner") displayRole = t("app.header.roleOwner", { defaultValue: "Owner" });
      else if (r === "admin") displayRole = t("app.header.roleAdmin", { defaultValue: "Admin" });
      else if (r === "tracker") displayRole = t("app.header.roleTracker", { defaultValue: "Tracker" });
      else displayRole = role;
    } else {
      displayRole = t("app.header.roleUnknown", { defaultValue: "No role assigned" });
    }
  }

  return (
    <header className="w-full border-b bg-white">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <Link to="/" className="text-lg font-semibold text-gray-900 whitespace-nowrap">
            {t("app.title", { defaultValue: "App Geocercas" })}
          </Link>

          {isAuthenticated && (
            <nav className="flex flex-wrap items-center gap-1">
              <NavItem to="/inicio">{t("app.tabs.inicio", { defaultValue: "Home" })}</NavItem>
              <NavItem to="/geocerca">{t("app.tabs.geocercas", { defaultValue: "Geofences" })}</NavItem>
              <NavItem to="/personal">{t("app.tabs.personal", { defaultValue: "Staff" })}</NavItem>
              <NavItem to="/actividades">{t("app.tabs.actividades", { defaultValue: "Activities" })}</NavItem>
              <NavItem to="/asignaciones">{t("app.tabs.asignaciones", { defaultValue: "Assignments" })}</NavItem>
              <NavItem to="/reportes">{t("app.tabs.reportes", { defaultValue: "Reports" })}</NavItem>
              <NavItem to="/dashboard">{t("app.tabs.dashboardCostos", { defaultValue: "Costs" })}</NavItem>
              <NavItem to="/tracker">{t("app.tabs.tracker", { defaultValue: "Tracker" })}</NavItem>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Idiomas */}
          <div className="flex items-center gap-1">
            <LangButton lng="es" label="ES" current={lang} onClick={setLang} />
            <LangButton lng="en" label="EN" current={lang} onClick={setLang} />
            <LangButton lng="fr" label="FR" current={lang} onClick={setLang} />
          </div>

          {isAuthenticated ? (
            <>
              <div className="hidden sm:flex flex-col text-right text-xs px-2 py-1 rounded bg-gray-100">
                <span className="font-medium text-gray-800">
                  {currentOrg?.name ?? t("app.header.organizationNone", { defaultValue: "No organization" })}
                </span>
                <span className="text-gray-600">{user?.email}</span>
                <span className="text-gray-600">
                  {t("app.header.loggedAs", { defaultValue: "Logged as" })}: <strong>{displayRole}</strong>
                </span>
              </div>

              <button
                onClick={handleLogout}
                className="px-3 py-2 rounded-md bg-gray-900 text-white text-sm whitespace-nowrap"
              >
                {t("app.header.logout", { defaultValue: "Logout" })}
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="px-3 py-2 rounded-md bg-gray-900 text-white text-sm whitespace-nowrap"
            >
              {t("app.header.login", { defaultValue: "Login" })}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
