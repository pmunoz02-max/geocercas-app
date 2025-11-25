// src/components/Header.jsx
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
// ✅ SIEMPRE así (ajusta el número de ../ según el nivel):
import { useAuth } from "../context/AuthContext.jsx";
 // ✅ usa el AuthContext centralizado

function NavItem({ to, children }) {
  const base =
    "px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100 transition-colors";
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
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await signOut();
    if (location.pathname !== "/") navigate("/", { replace: true });
  };

  return (
    <header className="w-full border-b bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        {/* ---------- LOGO / NAV PRINCIPAL ---------- */}
        <div className="flex items-center gap-4">
          <Link to="/" className="text-lg font-semibold text-gray-900">
            App Geocercas
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <NavItem to="/asignaciones">Asignaciones</NavItem>
            <NavItem to="/personal">Personal</NavItem>
            <NavItem to="/geocercas">Geocercas</NavItem>
            <NavItem to="/tracker">Tracker</NavItem>
          </nav>
        </div>

        {/* ---------- PERFIL / SESIÓN ---------- */}
        <div className="flex items-center gap-2">
          {!loading && user ? (
            <>
              <span className="hidden sm:inline text-xs text-gray-600 px-2 py-1 rounded bg-gray-100">
                {user.email ?? "Sin email"}
                {profile?.role ? ` · ${profile.role}` : ""}
              </span>
              <button
                onClick={handleLogout}
                className="px-3 py-2 rounded-md bg-gray-900 text-white text-sm"
                title="Cerrar sesión"
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <Link
              to="/login?redirectTo=/"
              className="px-3 py-2 rounded-md bg-gray-900 text-white text-sm"
            >
              Iniciar sesión
            </Link>
          )}
        </div>
      </div>

      {/* ---------- NAV SECUNDARIA (MÓVIL) ---------- */}
      <div className="md:hidden border-t bg-white">
        <div className="max-w-6xl mx-auto px-4 py-2 flex gap-1">
          <NavItem to="/asignaciones">Asignaciones</NavItem>
          <NavItem to="/personal">Personal</NavItem>
          <NavItem to="/geocercas">Geocercas</NavItem>
          <NavItem to="/tracker">Tracker</NavItem>
        </div>
      </div>
    </header>
  );
}
