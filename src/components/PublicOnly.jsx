// src/components/PublicOnly.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/auth.js";

export default function PublicOnly({ children }) {
  const { session, loading } = useAuth();

  // Mientras se resuelve la sesiÃ³n, no hacemos nada
  if (loading) {
    return null;
  }

  // Si el usuario ya estÃ¡ autenticado, no tiene sentido mostrar login/landing privada
  if (session) {
    return <Navigate to="/inicio" replace />;
  }

  // Usuario anÃ³nimo: puede ver este contenido pÃºblico
  return <>{children}</>;
}

