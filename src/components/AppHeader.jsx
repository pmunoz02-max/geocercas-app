// src/components/AppHeader.jsx
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../supabaseClient";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";

/** Helper universal */
function safeText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export default function AppHeader() {
  const navigate = useNavigate();
  const { session, currentRole, profile } = useAuth();
  const { t } = useTranslation();

  const isLogged = !!session;
  const rawRole = (currentRole || profile?.role || "").toLowerCase();
  const email = session?.user?.email || profile?.email || "";

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[AppHeader] Error al cerrar sesión:", err);
    } finally {
      navigate("/", { replace: true });
    }
  };

  let roleLabel = rawRole;
  if (rawRole === "owner") roleLabel = t("app.header.roleOwner");
  if (rawRole === "admin") roleLabel = t("app.header.roleAdmin");
  if (rawRole === "tracker") roleLabel = t("app.header.roleTracker");

  return (
    <header className="w-full border-b border-slate-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link to={isLogged ? "/inicio" : "/"} className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white font-semibold">
            AG
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-slate-900">
              {safeText(t("landing.brandName"))}
            </span>
            <span className="text-[11px] text-slate-500">
              {safeText(t("landing.brandTagline"))}
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-3 text-xs">
          <LanguageSwitcher />

          {isLogged ? (
            <>
              <div className="hidden sm:flex flex-col items-end">
                {email && <span className="font-medium text-slate-700">{email}</span>}
                {rawRole && (
                  <span className="uppercase tracking-wide text-[10px] text-slate-400">
                    {safeText(roleLabel)}
                  </span>
                )}
              </div>

              {rawRole === "owner" && (
                <Link
                  to="/admins"
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500 text-white hover:bg-amber-400"
                >
                  {safeText(t("app.tabs.admins"))}
                </Link>
              )}

              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-md text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {safeText(t("app.header.logout"))}
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="px-3 py-1.5 rounded-md text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {safeText(t("app.header.login"))}
              </Link>

              <Link
                to="/login?mode=magic"
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500"
              >
                {safeText(t("app.header.loginMagic"))}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
