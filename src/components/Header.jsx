// src/components/Header.jsx
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function NavItem({ to, children }) {
  const base =
    "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full " +
    "text-sm font-semibold whitespace-nowrap border transition-all duration-150 " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

  const active =
    "bg-slate-900 text-white border-slate-900 shadow-sm shadow-emerald-500/10";

  const inactive =
    "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 hover:shadow-sm";

  return (
    <NavLink
      to={to}
      className={({ isActive }) => (isActive ? `${base} ${active}` : `${base} ${inactive}`)}
    >
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
}

export default function Header() {
  const { user, loading, currentOrg, currentRole, isAppRoot, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const roleLabel = isAppRoot ? "ROOT" : currentRole ? currentRole.toUpperCase() : "SIN ROL";

  const handleLogout = async () => {
    await logout();
    if (location.pathname !== "/login") {
      navigate("/login", { replace: true });
    }
  };

  return (
    <header className="w-full border-b bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Link to="/inicio" className="text-lg font-semibold text-slate-900">
            App Geocercas
          </Link>

          {user && (
            <nav className="hidden md:flex items-center gap-2">
              <NavItem to="/inicio">Inicio</NavItem>
              <NavItem to="/geocerca">Geocerca</NavItem>
              <NavItem to="/personal">Personal</NavItem>
              <NavItem to="/actividades">Actividades</NavItem>
              <NavItem to="/asignaciones">Asignaciones</NavItem>
              <NavItem to="/reportes">Reportes</NavItem>
              <NavItem to="/tracker">Tracker</NavItem>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!loading && user ? (
            <>
              <div className="hidden sm:flex flex-col text-right text-xs px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-medium text-slate-800">
                  {currentOrg?.name ?? "Sin organización"}
                </span>
                <span className="text-slate-600">{roleLabel}</span>
              </div>

              <button
                onClick={handleLogout}
                className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold border border-slate-900 hover:bg-slate-800 transition"
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold border border-slate-900 hover:bg-slate-800 transition"
            >
              Iniciar sesión
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
