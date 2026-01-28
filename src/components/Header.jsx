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
  const {
    user,
    loading,
    currentOrg,
    role, // ⚠️ puede venir null/undefined
    signOut,
    isAuthenticated,
  } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await signOut();
    if (location.pathname !== "/login") {
      navigate("/login", { replace: true });
    }
  };

  // 🔐 Rol a mostrar (robusto)
  let displayRole = "Cargando…";

  if (!loading) {
    if (!currentOrg) {
      displayRole = "Sin organización";
    } else if (role) {
      displayRole = role;
    } else {
      displayRole = "Sin rol asignado";
    }
  }

  return (
    <header className="w-full border-b bg-white">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            to="/"
            className="text-lg font-semibold text-gray-900 whitespace-nowrap"
          >
            App Geocercas
          </Link>

          {isAuthenticated && (
            <nav className="flex flex-wrap items-center gap-1">
              <NavItem to="/inicio">Inicio</NavItem>
              <NavItem to="/geocerca">Geocercas</NavItem>
              <NavItem to="/personal">Personal</NavItem>
              <NavItem to="/actividades">Actividades</NavItem>
              <NavItem to="/asignaciones">Asignaciones</NavItem>
              <NavItem to="/reportes">Reportes</NavItem>
              <NavItem to="/dashboard">Costos</NavItem>
              <NavItem to="/tracker">Tracker</NavItem>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <>
              <div className="hidden sm:flex flex-col text-right text-xs px-2 py-1 rounded bg-gray-100">
                <span className="font-medium text-gray-800">
                  {currentOrg?.name ?? "Sin organización"}
                </span>
                <span className="text-gray-600">{user?.email}</span>
                <span className="text-gray-600">
                  Rol: <strong>{displayRole}</strong>
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
              Entrar
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
