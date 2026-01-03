// src/components/AuthGuard.jsx
import { useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function AuthGuard({ children }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  // 1) Mientras carga auth (sesión + org + rol en AuthContext) -> loader
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          Cargando autenticación…
        </div>
      </div>
    );
  }

  // 2) Sin sesión -> login
  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  // 3) Con sesión -> permitir acceso (NO decidir rutas por rol aquí)
  return children;
}
