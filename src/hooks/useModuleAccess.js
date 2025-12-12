// src/hooks/useModuleAccess.js
import { useAuth } from "../context/AuthContext.jsx";
import { canAccessModule, normalizeRole } from "../lib/permissions";

export function useModuleAccess(moduleKey) {
  const { role: rawRole, loading } = useAuth();

  // Mientras AuthContext está cargando, NO bloquear nada
  if (loading) {
    return {
      role: null,
      canView: true,
      loading: true,
    };
  }

  const role = normalizeRole(rawRole);

  const canView = !moduleKey
    ? true
    : canAccessModule(role, moduleKey);

  return { role, canView, loading: false };
}
