// src/components/Header.jsx
import React from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";
import { SUPPORTED } from "../i18n/index.js";

function cx(...arr) {
  return arr.filter(Boolean).join(" ");
}

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cx(
          "px-3 py-2 rounded-xl text-sm font-semibold transition whitespace-nowrap",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70",
          isActive
            ? "bg-white/10 text-white border border-white/10"
            : "text-white/70 hover:text-white hover:bg-white/5"
        )
      }
    >
      {children}
    </NavLink>
  );
}

function LangPill({ lng, current, onClick }) {
  const active = current === lng;
  return (
    <button
      type="button"
      onClick={() => onClick(lng)}
      className={cx(
        "px-3 py-1.5 rounded-full text-xs font-bold tracking-wide transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70",
        active
          ? "bg-emerald-500 text-slate-950"
          : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10"
      )}
      aria-pressed={active}
      aria-label={`Language ${lng}`}
    >
      {lng.toUpperCase()}
    </button>
  );
}

export default function Header() {
  const { t, i18n } = useTranslation();
  const { user, loading, currentOrg, role, signOut, isAuthenticated } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const lang = String(i18n.language || "es").slice(0, 2);

  const setLang = (lng) => {
    const code = String(lng || "es").toLowerCase().slice(0, 2);
    if (!SUPPORTED.includes(code)) return;
    i18n.changeLanguage(code);
    // persistencia la hace i18n/index.js con app_lang
  };

  const handleLogout = async () => {
    await signOut();
    if (location.pathname !== "/login") navigate("/login", { replace: true });
  };

  // Rol a mostrar (robusto)
  let displayRole = t("common.actions.loading", { defaultValue: "Cargando…" });
  if (!loading) {
    if (!currentOrg) {
      displayRole = t("app.header.organizationNone", { defaultValue: "Sin organización" });
    } else if (role) {
      const r = String(role).toLowerCase();
      if (r === "owner") displayRole = t("app.header.roleOwner", { defaultValue: "Owner" });
      else if (r === "admin") displayRole = t("app.header.roleAdmin", { defaultValue: "Admin" });
      else if (r === "tracker") displayRole = t("app.header.roleTracker", { defaultValue: "Tracker" });
      else displayRole = role;
    } else {
      displayRole = t("app.header.roleUnknown", { defaultValue: "Sin rol asignado" });
    }
  }

  return (
    <header className="w-full sticky top-0 z-50 border-b border-white/10 bg-slate-950/85 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <Link to="/" className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-emerald-600/90 flex items-center justify-center font-extrabold text-slate-950">
              AG
            </div>
            <div className="min-w-0">
              <div className="text-white font-bold leading-tight truncate">
                {t("app.title", { defaultValue: "App Geocercas" })}
              </div>
              <div className="text-[11px] text-white/50 truncate">
                {t("app.subtitle", { defaultValue: "Geocercas • Personal • Actividades" })}
              </div>
            </div>
          </Link>

          {isAuthenticated && (
            <nav className="hidden lg:flex items-center gap-1">
              <NavItem to="/inicio">{t("app.tabs.inicio", { defaultValue: "Inicio" })}</NavItem>
              <NavItem to="/geocerca">{t("app.tabs.geocercas", { defaultValue: "Geocercas" })}</NavItem>
              <NavItem to="/personal">{t("app.tabs.personal", { defaultValue: "Personal" })}</NavItem>
              <NavItem to="/actividades">{t("app.tabs.actividades", { defaultValue: "Actividades" })}</NavItem>
              <NavItem to="/asignaciones">{t("app.tabs.asignaciones", { defaultValue: "Asignaciones" })}</NavItem>
              <NavItem to="/reportes">{t("app.tabs.reportes", { defaultValue: "Reportes" })}</NavItem>
              <NavItem to="/dashboard">{t("app.tabs.dashboardCostos", { defaultValue: "Costos" })}</NavItem>
              <NavItem to="/tracker">{t("app.tabs.tracker", { defaultValue: "Tracker" })}</NavItem>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Idiomas */}
          <div className="flex items-center gap-1 p-1 rounded-full bg-white/5 border border-white/10">
            <LangPill lng="es" current={lang} onClick={setLang} />
            <LangPill lng="en" current={lang} onClick={setLang} />
            <LangPill lng="fr" current={lang} onClick={setLang} />
          </div>

          {isAuthenticated ? (
            <>
              <div className="hidden md:flex flex-col text-right text-xs px-3 py-1.5 rounded-2xl bg-white/5 border border-white/10">
                <span className="font-semibold text-white">
                  {currentOrg?.name ?? t("app.header.organizationNone", { defaultValue: "Sin organización" })}
                </span>
                <span className="text-white/60">{user?.email}</span>
                <span className="text-white/60">
                  {t("app.header.loggedAs", { defaultValue: "Rol" })}:{" "}
                  <span className="font-semibold text-white">{displayRole}</span>
                </span>
              </div>

              <button
                onClick={handleLogout}
                className={cx(
                  "px-4 py-2 rounded-2xl text-sm font-bold transition",
                  "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
                )}
              >
                {t("app.header.logout", { defaultValue: "Salir" })}
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className={cx(
                "px-4 py-2 rounded-2xl text-sm font-bold transition",
                "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
              )}
            >
              {t("app.header.login", { defaultValue: "Entrar" })}
            </Link>
          )}
        </div>
      </div>

      {/* Tabs en móvil/tablet */}
      {isAuthenticated && (
        <div className="lg:hidden border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide">
            <NavItem to="/inicio">{t("app.tabs.inicio", { defaultValue: "Inicio" })}</NavItem>
            <NavItem to="/geocerca">{t("app.tabs.geocercas", { defaultValue: "Geocercas" })}</NavItem>
            <NavItem to="/personal">{t("app.tabs.personal", { defaultValue: "Personal" })}</NavItem>
            <NavItem to="/actividades">{t("app.tabs.actividades", { defaultValue: "Actividades" })}</NavItem>
            <NavItem to="/asignaciones">{t("app.tabs.asignaciones", { defaultValue: "Asignaciones" })}</NavItem>
            <NavItem to="/reportes">{t("app.tabs.reportes", { defaultValue: "Reportes" })}</NavItem>
            <NavItem to="/dashboard">{t("app.tabs.dashboardCostos", { defaultValue: "Costos" })}</NavItem>
            <NavItem to="/tracker">{t("app.tabs.tracker", { defaultValue: "Tracker" })}</NavItem>
          </div>
        </div>
      )}
    </header>
  );
}
