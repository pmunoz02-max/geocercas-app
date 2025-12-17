// src/components/AuthGuard.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function AuthGuard({ children }) {
  const { session, loading, role } = useAuth();
  const location = useLocation();

  // 1) Mientras AuthContext carga sesión / rol → loader
  //    ⚠️ CLAVE: role === null significa "aún no sabemos qué es el usuario"
  if (loading || (session && role == null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          Cargando permisos…
        </div>
      </div>
    );
  }

  // 2) Sin sesión → login
  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  const roleLower = String(role || "").toLowerCase();
  const path = location.pathname;

  // 3) TRACKER: solo puede estar en /tracker-gps
  if (roleLower === "tracker") {
    if (!path.startsWith("/tracker-gps")) {
      return <Navigate to="/tracker-gps" replace />;
    }
  }

  // 4) NO-TRACKER: no puede estar en /tracker-gps
  if (roleLower !== "tracker" && path.startsWith("/tracker-gps")) {
    return <Navigate to="/inicio" replace />;
  }

  // 5) Todo OK → render
  return children;
}
