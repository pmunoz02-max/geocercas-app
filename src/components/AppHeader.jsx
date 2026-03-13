// src/components/AppHeader.jsx
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/auth.js";
import { supabase } from "../supabaseClient";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";

/** =========================
 * Helpers (a prueba de i18n)
 * ========================= */
function safeText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
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
      console.error("[AppHeader] Error signing out:", err);
    } finally {
      navigate("/", { replace: true });
    }
  };

  let roleLabel = rawRole;
  if (rawRole === "owner") {
    roleLabel = t("app.header.roleOwner", { defaultValue: "Owner" });
  }
  if (rawRole === "admin") {
    roleLabel = t("app.header.roleAdmin", { defaultValue: "Administrator" });
  }
  if (rawRole === "tracker") {
    roleLabel = t("app.header.roleTracker", { defaultValue: "Tracker" });
  }

  return (
    <header className="w-full border-b border-slate-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link to={isLogged ? "/inicio" : "/"} className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white font-semibold">
            AG
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-slate-900">
              {safeText(t("landing.brandName", { defaultValue: "App Geocercas" }))}
            </span>
            <span className="text-[11px] text-slate-500">
              {safeText(
                t("landing.brandTagline", {
                  defaultValue: "Personnel control by geofences",
                })
              )}
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
                  {safeText(t("app.tabs.admins", { defaultValue: "Administrator" }))}
                </Link>
              )}

              <Link
                to="/settings/delete-account"
                className="px-3 py-1.5 rounded-md text-xs font-semibold border border-red-300 text-red-700 hover:bg-red-50"
              >
                Delete account
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-md text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {safeText(t("app.header.logout", { defaultValue: "Sign out" }))}
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="px-3 py-1.5 rounded-md text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              {safeText(t("app.header.login", { defaultValue: "Sign in" }))}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}