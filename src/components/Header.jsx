import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const FORCE_ADMIN_TAB = true; // <- DEBUG: ponlo en false cuando ya esté isAppRoot ok

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
    ? String(currentRole).toUpperCase()
    : "SIN ROL";

  const handleLogout = async () => {
    await logout();
    if (location.pathname !== "/login") navigate("/login", { replace: true });
  };

  const showAdmin = FORCE_ADMIN_TAB || isAppRoot;

  return (
    <header className="w-full border-b bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <Link to="/inicio" className="text-lg font-semibold text-gray-900 whitespace-nowrap">
            App Geocercas
          </Link>

          {user && (
            <nav className="flex flex-wrap items-center gap-1" aria-label="Navegación principal">
              {showAdmin && <NavItem to="/admin">Administrador</NavItem>}

              <NavItem to="/inicio">Home</NavItem>
              <NavItem to="/geocerca">Geofence</NavItem>
              <NavItem to="/personal">Personnel</NavItem>
              <NavItem to="/actividades">Activities</NavItem>
              <NavItem to="/asignaciones">Assignments</NavItem>
              <NavItem to="/reportes">Reports</NavItem>
              <NavItem to="/costos-dashboard">Costs Dashboard</NavItem>
              <NavItem to="/tracker">Tracker</NavItem>
              <NavItem to="/invite-tracker">Invite tracker</NavItem>
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
                <span className="text-gray-600">{user.email}</span>
                <span className="text-gray-600">
                  {roleLabel} · isAppRoot={String(isAppRoot)}
                </span>
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
