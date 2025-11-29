// src/components/AppHeader.jsx
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../supabaseClient";

export default function AppHeader() {
  const navigate = useNavigate();
  const { session, currentRole, profile } = useAuth();

  const isLogged = !!session;
  const role = (currentRole || profile?.role || "").toLowerCase();
  const email = session?.user?.email || profile?.email || "";

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[AppHeader] Error al cerrar sesión:", err);
    } finally {
      // AuthContext al recibir session = null ya limpia orgs, etc.
      navigate("/", { replace: true });
    }
  };

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
              App Geocercas
            </span>
            <span className="text-[11px] text-slate-500">
              Control de personal por geocercas
            </span>
          </div>
        </Link>

        {/* Zona derecha */}
        {isLogged ? (
          <div className="flex items-center gap-3 text-xs">
            {/* Email + rol */}
            <div className="hidden sm:flex flex-col items-end">
              {email && (
                <span className="font-medium text-slate-700">{email}</span>
              )}
              {role && (
                <span className="uppercase tracking-wide text-[10px] text-slate-400">
                  {role}
                </span>
              )}
            </div>

            {/* Botón Admins solo para OWNER */}
            {role === "owner" && (
              <Link
                to="/admins"
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500 text-white hover:bg-amber-400"
              >
                Admins
              </Link>
            )}

            {/* Botón Salir */}
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-md text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Salir
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="px-3 py-1.5 rounded-md text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Iniciar sesión
            </Link>

            <Link
              to="/login"
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500"
            >
              Entrar con Magic Link
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
