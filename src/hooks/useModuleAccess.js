// src/hooks/useModuleAccess.js
import { useAuth } from "../context/AuthContext.jsx";
import { canAccessModule, normalizeRole } from "../lib/permissions";

export function useModuleAccess(moduleKey) {
  // AUTH CONTEXT SOLO EXPONE "role", NO "currentRole"
  const { role: rawRole, loading } = useAuth();

  // Normalizamos a minúsculas
  const role = normalizeRole(rawRole);

  // Si no se envía módulo → acceso universal
  const canView = !moduleKey
    ? true
    : canAccessModule(role, moduleKey);

  return { role, canView, loading };
}
