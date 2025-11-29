// src/components/PublicOnly.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function PublicOnly({ children }) {
  const { session, loading } = useAuth();

  // Mientras se resuelve la sesión, no hacemos nada
  if (loading) {
    return null;
  }

  // Si el usuario ya está autenticado, no tiene sentido mostrar login/landing privada
  if (session) {
    return <Navigate to="/inicio" replace />;
  }

  // Usuario anónimo: puede ver este contenido público
  return <>{children}</>;
}
