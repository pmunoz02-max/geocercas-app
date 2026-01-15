import { NavLink, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { useAuth } from "../context/AuthContext.jsx";

export default function MainNav({ role }) {
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const isAdmin = useMemo(() => {
    const r = (role || "").toLowerCase();
    return r === "admin" || r === "owner" || r === "root";
  }, [role]);

  const handleSignOut = async () => {
    await logout();
    navigate("/login");
  };

  const base =
    "inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap border transition-all";
  const active = "bg-emerald-600 text-white border-emerald-600";
  const inactive =
    "bg-slate-50 text-slate-900 border-slate-300 hover:bg-emerald-50";

  return (
    <div className="flex items-center gap-3 w-full justify-end">
      <div className="flex gap-2 overflow-x-auto">
        <NavLink to="/geocerca" className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>
          Geocerca
        </NavLink>

        <NavLink to="/personal" className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>
          Personal
        </NavLink>

        <NavLink to="/tracker" className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>
          Tracker
        </NavLink>

        {isAdmin && (
          <NavLink to="/reportes" className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>
            Reportes
          </NavLink>
        )}
      </div>

      {user && (
        <button
          onClick={handleSignOut}
          className="px-3 py-2 rounded-full text-sm font-semibold border border-slate-300 bg-white"
        >
          Salir
        </button>
      )}
    </div>
  );
}
