// src/components/AuthGuard.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function AuthGuard({ children }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  // 1) Mientras AuthContext todavía está resolviendo la sesión,
  //    NO redirigimos a ningún lado: mostramos un loader.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          Cargando tu sesión…
        </div>
      </div>
    );
  }

  // 2) Cuando sabemos que NO hay sesión → mandamos a /login
  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  // 3) Hay sesión y ya terminó de cargar → render normal
  return children;
}
