import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function NavItem({ to, children }) {
  const base =
    "px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100 transition-colors whitespace-nowrap";
  const active = "bg-gray-900 text-white hover:bg-gray-900";
  const inactive = "text-gray-700";

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        isActive ? `${base} ${active}` : `${base} ${inactive}`
      }
    >
      {children}
    </NavLink>
  );
}

export default function Header() {
  const { user, loading, currentOrg, currentRole, isAppRoot, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const roleLabel = isAppRoot
    ? "ROOT"
    : currentRole
    ? currentRole.toUpperCase()
    : "SIN ROL";

  const handleLogout = async () => {
    await logout();
    if (location.pathname !== "/login") {
      navigate("/login", { replace: true });
    }
  };

  return (
    <header className="w-full border-b bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <Link to="/inicio" className="text-lg font-semibold text-gray-900">
            App Geocercas
          </Link>

          {user && (
            <nav
              className="
                flex items-center gap-1
                overflow-x-auto
                [-webkit-overflow-scrolling:touch]
                scrollbar-none
                max-w-[62vw]
              "
              aria-label="Navegación principal"
            >
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
              <div className="hidden sm:flex flex-col text-right text-xs px-2 py-1 rounded bg-gray-100">
                <span className="font-medium text-gray-800">
                  {currentOrg?.name ?? "Sin organización"}
                </span>
                <span className="text-gray-600">{roleLabel}</span>
              </div>

              <button
                onClick={handleLogout}
                className="px-3 py-2 rounded-md bg-gray-900 text-white text-sm whitespace-nowrap"
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="px-3 py-2 rounded-md bg-gray-900 text-white text-sm whitespace-nowrap"
            >
              Iniciar sesión
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
