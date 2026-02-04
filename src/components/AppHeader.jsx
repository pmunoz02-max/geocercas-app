// src/components/AppHeader.jsx
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";

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

function cx(...arr) {
  return arr.filter(Boolean).join(" ");
}

export default function AppHeader() {
  const navigate = useNavigate();
  const { session, role, signOut } = useAuth();
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

  let roleLabel = rawRole;
  if (rawRole === "owner") roleLabel = t("app.header.roleOwner", { defaultValue: "Propietario" });
  if (rawRole === "admin") roleLabel = t("app.header.roleAdmin", { defaultValue: "Administrador" });
  if (rawRole === "tracker") roleLabel = t("app.header.roleTracker", { defaultValue: "Tracker" });
  if (rawRole === "root" || rawRole === "root_owner")
    roleLabel = t("app.header.roleRoot", { defaultValue: "Root" });

  const btnBase =
    "px-4 py-2 rounded-full text-xs font-extrabold transition " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60";

  return (
    <header className="w-full border-b border-slate-200 bg-white sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link to={isLogged ? "/inicio" : "/"} className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white font-extrabold shadow-sm">
            AG
          </div>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-extrabold text-slate-900 truncate">
              {safeText(t("landing.brandName", { defaultValue: "App Geocercas" }))}
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              {safeText(t("landing.brandTagline", { defaultValue: "Control de personal por geocercas" }))}
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          {/* ✅ pill contenedor para switch */}
          <div className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 shadow-sm">
            <LanguageSwitcher />
          </div>

          {isLogged ? (
            <>
              <div className="hidden md:flex flex-col items-end text-xs">
                {email && <div className="font-semibold text-slate-800">{email}</div>}
                {rawRole && (
                  <div className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
                    {safeText(roleLabel)}
                  </div>
                )}
              </div>

              {(rawRole === "owner" || rawRole === "root" || rawRole === "root_owner") && (
                <Link
                  to="/admins"
                  className={cx(
                    btnBase,
                    "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md hover:brightness-105"
                  )}
                >
                  {safeText(t("app.tabs.admins", { defaultValue: "Administradores" }))}
                </Link>
              )}

              <button
                type="button"
                onClick={handleLogout}
                className={cx(
                  btnBase,
                  "bg-emerald-600 text-white shadow-md hover:bg-emerald-500"
                )}
              >
                {safeText(t("app.header.logout", { defaultValue: "Salir" }))}
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className={cx(btnBase, "bg-emerald-600 text-white shadow-md hover:bg-emerald-500")}
            >
              {safeText(t("app.header.login", { defaultValue: "Entrar" }))}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
