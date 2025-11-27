// src/components/AuthGuard.jsx
// Protección de rutas privadas con selección automática de organización
//----------------------------------------------------

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function AuthGuard({ children }) {
  const {
    user,
    loading,
    currentOrg,
    orgs,
    setCurrentOrg,
  } = useAuth();

  const location = useLocation();

  // 1. Mientras carga el contexto mostramos un loader
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-10 w-10 rounded-full border-4 border-emerald-600 border-t-transparent animate-spin" />
          <p className="text-slate-500 text-sm">Cargando sesión…</p>
        </div>
      </div>
    );
  }

  // 2. Si no hay sesión → redirigir a login
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // 3. Si hay sesión pero NO tienes una organización seleccionada
  if (!currentOrg) {
    // 3.a Si el usuario solo tiene una organización → seleccionarla automáticamente
    if (orgs && orgs.length === 1) {
      setCurrentOrg(orgs[0]);
      // Devolvemos un pequeño loader mientras se aplica la org y se re-renderiza
      return (
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="h-10 w-10 rounded-full border-4 border-emerald-600 border-t-transparent animate-spin" />
            <p className="text-slate-500 text-sm">
              Configurando tu organización…
            </p>
          </div>
        </div>
      );
    }

    // 3.b Si hay 0 o varias organizaciones y aún no se ha elegido ninguna,
    //     redirigir a la pantalla de selección (excepto si ya estamos allí)
    if (location.pathname !== "/seleccionar-organizacion") {
      return (
        <Navigate
          to="/seleccionar-organizacion"
          replace
          state={{ from: location }}
        />
      );
    }
  }

  // 4. Autorizado → renderizar contenido protegido
  return children;
}
