// src/components/MainNav.jsx
import { NavLink, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";

const SUPPORTED = new Set(["es", "en", "fr"]);

export default function MainNav({ role }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const currentLang = String(i18n?.resolvedLanguage || i18n?.language || "es")
    .toLowerCase()
    .slice(0, 2);

  function changeLang(code) {
    if (!SUPPORTED.has(code)) return;

    const normalized = String(code).toLowerCase().slice(0, 2);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", normalized);

    window.location.assign(url.toString());
  }

  const isAdmin = useMemo(() => {
    const r = (role || "").toLowerCase();
    return r === "admin" || r === "owner" || r === "root";
  }, [role]);

  const handleSignOut = async () => {
    await logout();
    navigate("/login");
  };

  const base =
    "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full " +
    "text-sm font-semibold whitespace-nowrap border transition-all duration-150 " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

  const active =
    "bg-slate-900 text-white border-slate-900 shadow-sm shadow-emerald-500/10";

  const inactive =
    "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 hover:shadow-sm";

  const Pill = ({ to, children }) => (
    <NavLink to={to} className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>
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

  return (
    <div className="flex items-center gap-3 w-full justify-end">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        <Pill to="/geocerca">{t("app.tabs.geocerca", { defaultValue: t("app.tabs.geocercas") })}</Pill>
        <Pill to="/personal">{t("app.tabs.personal")}</Pill>
        <Pill to="/tracker">{t("app.tabs.tracker")}</Pill>
        {isAdmin && <Pill to="/reportes">{t("app.tabs.reportes")}</Pill>}
      </div>

      {user && (
        <button
          onClick={handleSignOut}
          className="inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition"
        >
          {t("app.header.logout")}
        </button>
      )}

      <div className="flex items-center gap-2 ml-1">
        {[
          { code: "es", label: "ES" },
          { code: "en", label: "EN" },
          { code: "fr", label: "FR" },
        ].map((lang) => {
          const isActive = currentLang === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => {
                if (!SUPPORTED.has(lang.code)) return;
                if (lang.code === currentLang) return;

                changeLang(lang.code);
              }}
              className={`inline-flex items-center justify-center px-2.5 py-1.5 rounded-full text-xs border transition ${
                isActive
                  ? "font-bold bg-slate-900 text-white border-slate-900"
                  : "font-medium bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
              }`}
              aria-pressed={isActive}
            >
              {lang.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

