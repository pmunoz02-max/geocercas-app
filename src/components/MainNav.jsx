import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * MainNav
 * - Botones de cabecera con alto contraste (no “lavados”).
 * - Scroll horizontal limpio en móvil (sin barra gris visible en Windows).
 * - Soporta role opcional (admin/tracker/viewer/etc.).
 */
export default function MainNav({ role }) {
  const [userEmail, setUserEmail] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  const isAdmin = useMemo(() => {
    const r = (role || "").toLowerCase();
    return r === "admin" || r === "owner" || r === "root" || r === "root_owner";
  }, [role]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const base =
    "inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap border transition-all " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2";

  const active =
    "bg-emerald-600 text-white border-emerald-600 shadow-sm";
  const inactive =
    "bg-slate-50 text-slate-900 border-slate-300 hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-800";

  return (
    <div className="flex items-center gap-3 w-full justify-end">
      {/* LINKS */}
      <div
        className="
          flex gap-2
          overflow-x-auto
          justify-end
          [-ms-overflow-style:none]
          [scrollbar-width:none]
          [&::-webkit-scrollbar]:hidden
        "
      >
        <NavLink
          to="/mapa"
          className={({ isActive }) => `${base} ${isActive ? active : inactive}`}
        >
          Mapa
        </NavLink>

        <NavLink
          to="/geocercas"
          className={({ isActive }) => `${base} ${isActive ? active : inactive}`}
        >
          Geocercas
        </NavLink>

        <NavLink
          to="/personal"
          className={({ isActive }) => `${base} ${isActive ? active : inactive}`}
        >
          Personal
        </NavLink>

        <NavLink
          to="/tracker-dashboard"
          className={({ isActive }) => `${base} ${isActive ? active : inactive}`}
        >
          Tracker
        </NavLink>

        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `${base} ${isActive ? active : inactive}`
            }
          >
            Admin
          </NavLink>
        )}
      </div>

      {/* USER + SALIR */}
      <div className="flex items-center gap-2">
        {userEmail && (
          <span className="hidden sm:inline text-xs text-slate-600 max-w-[220px] truncate">
            {userEmail}
          </span>
        )}

        <button
          onClick={handleSignOut}
          className="inline-flex items-center justify-center px-3 py-2 rounded-full text-sm font-semibold border border-slate-300 bg-white hover:bg-slate-50 transition-all"
        >
          Salir
        </button>
      </div>
    </div>
  );
}
