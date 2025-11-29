// src/components/AuthGuard.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function AuthGuard({ children }) {
  const { session, loading } = useAuth();

  // Mientras se resuelve la sesión, no hacemos nada
  if (loading) {
    return null;
    // Opcional: luego podemos meter un spinner centrado aquí
    // return <div className="p-4 text-center text-slate-500 text-sm">Cargando...</div>;
  }

  // Si no hay sesión, siempre redirigimos a la Landing
  if (!session) {
    return <Navigate to="/" replace />;
  }

  // Si hay sesión, dejamos pasar al contenido protegido
  return <>{children}</>;
}
