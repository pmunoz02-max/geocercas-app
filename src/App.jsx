import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
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
  const { session, role, isAppRoot, signOut } = useAuth(); // 👈 agregamos isAppRoot
  const { t } = useTranslation();

  const isLogged = !!session;
  const rawRole = String(role || "").toLowerCase();
  const email = session?.user?.email || "";

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error("[AppHeader] Error al cerrar sesión:", err);
    } finally {
      navigate("/", { replace: true });
    }
  };

  // Traducción básica de roles (fallback al valor original si no matchea)
  let roleLabel = rawRole;
  if (rawRole === "owner") roleLabel = t("app.header.roleOwner", { defaultValue: "Propietario" });
  if (rawRole === "admin") roleLabel = t("app.header.roleAdmin", { defaultValue: "Administrador" });
  if (rawRole === "tracker") roleLabel = t("app.header.roleTracker", { defaultValue: "Tracker" });
  if (rawRole === "root" || rawRole === "root_owner") roleLabel = t("app.header.roleRoot", { defaultValue: "Root" });

  return (
    <header className="w-full border-b border-slate-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Branding */}
        <Link to={isLogged ? "/inicio" : "/"} className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white font-semibold">
            AG
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-slate-900">
              {safeText(t("landing.brandName", { defaultValue: "App Geocercas" }))}
            </span>
            <span className="text-[11px] text-slate-500">
              {safeText(t("landing.brandTagline", { defaultValue: "Control de personal por geocercas" }))}
            </span>
          </div>
        </Link>

        {/* Zona derecha */}
        <div className="flex items-center gap-3 text-xs">
          <LanguageSwitcher />

          {isLogged ? (
            <>
              {/* Email + rol */}
              <div className="hidden sm:flex flex-col items-end">
                {email && <span className="font-medium text-slate-700">{email}</span>}
                {rawRole && (
                  <span className="uppercase tracking-wide text-[10px] text-slate-400">
                    {safeText(roleLabel)}
                  </span>
                )}
              </div>

              {/* ✅ Botón Administrador SOLO para App Root (alineado con AdminRoute) */}
              {isAppRoot && (
                <Link
                  to="/admins"
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500 text-white hover:bg-amber-400"
                >
                  {safeText(t("app.tabs.admins", { defaultValue: "Administrador" }))}
                </Link>
              )}

              {/* Salir */}
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-md text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {safeText(t("app.header.logout", { defaultValue: "Salir" }))}
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="px-3 py-1.5 rounded-md text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              {safeText(t("app.header.login", { defaultValue: "Entrar" }))}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
