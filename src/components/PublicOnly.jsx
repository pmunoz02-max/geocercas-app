// src/components/PublicOnly.jsx
// Evita que usuarios autenticados regresen al login
//----------------------------------------------------

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function PublicOnly({ children }) {
  const {
    user,
    loading,
    currentOrg,
  } = useAuth();

  const location = useLocation();

  // Mientras carga sesión
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-10 w-10 rounded-full border-4 border-slate-800 border-t-transparent animate-spin" />
          <p className="text-slate-500 text-sm">Inicializando…</p>
        </div>
      </div>
    );
  }

  // Usuario NO logueado → puede ver pantalla pública
  if (!user) return children;

  // Usuario logueado pero sin org → forzar selección
  if (user && !currentOrg) {
    return (
      <Navigate
        to="/seleccionar-organizacion"
        replace
        state={{ from: location }}
      />
    );
  }

  // Usuario logueado con org → redirigir al dashboard
  return <Navigate to="/inicio" replace />;
}
