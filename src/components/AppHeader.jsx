// src/components/AppHeader.jsx
import { Link } from "react-router-dom";
import { useAuth } from "@/context/auth.js";
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
  const {
    isAuthenticated,
    user,
    currentRole,
    organizations,
    currentOrg,
    switchingOrg,
    selectOrg,
    logout,
  } = useAuth();
  const { t } = useTranslation();

  const isLogged = Boolean(isAuthenticated);
  const rawRole = String(currentRole || "").toLowerCase();
  const email = user?.email || "";
  const orgOptions = Array.isArray(organizations) ? organizations.filter((org) => org?.id) : [];
  const showOrgSelector = isLogged && orgOptions.length > 1;

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error("[AppHeader] Error signing out:", err);
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
              {showOrgSelector && (
                <label className="flex flex-col gap-1 text-[11px] text-slate-500">
                  <span>{safeText(t("app.header.currentOrg", { defaultValue: "Organization" }))}</span>
                  <select
                    className="min-w-[180px] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    value={currentOrg?.id || ""}
                    onChange={(e) => selectOrg(e.target.value)}
                    disabled={switchingOrg}
                  >
                    {orgOptions.map((org) => (
                      <option key={org.id} value={org.id}>
                        {safeText(org.name || org.id)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="hidden sm:flex flex-col items-end">
                {email && <span className="font-medium text-slate-700">{email}</span>}
                {currentOrg?.name && (
                  <span className="text-[10px] text-slate-500">{currentOrg.name}</span>
                )}
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
                className="px-4 py-2 rounded-xl text-sm font-semibold border border-red-600 bg-red-600 text-white hover:bg-red-700 transition"
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