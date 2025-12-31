import React from "react";
import { useAuth } from "../context/AuthContext";

/**
 * Inicio.jsx
 * Página principal del panel.
 *
 * PRINCIPIO:
 * - NO valida sesión
 * - NO valida rol
 * - NO redirige
 * - NO muestra Landing
 *
 * Todo eso ya fue resuelto antes por:
 * AuthGuard + PanelGate + AuthContext
 */

export default function Inicio() {
  const {
    loading,
    user,
    currentOrg,
    role,
  } = useAuth();

  // Mientras AuthContext termina de hidratar datos
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="text-slate-500 text-sm">
          Cargando panel…
        </span>
      </div>
    );
  }

  // Este caso NO debería ocurrir si AuthGuard funciona,
  // pero lo dejamos defensivo (sin redirecciones).
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="text-red-500 text-sm">
          Sesión no disponible.
        </span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold text-slate-800">
        Panel principal
      </h1>

      <div className="text-slate-600 text-sm">
        Bienvenido <strong>{user.email}</strong>
      </div>

      <div className="text-slate-600 text-sm">
        Organización activa:{" "}
        <strong>{currentOrg?.name || "—"}</strong>
      </div>

      <div className="text-slate-600 text-sm">
        Rol: <strong>{role || "—"}</strong>
      </div>

      {/* 
        Aquí va el contenido real del dashboard:
        cards, mapas, KPIs, accesos, etc.
        Nada de lógica de auth aquí.
      */}
    </div>
  );
}
