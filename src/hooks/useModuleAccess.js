// src/hooks/useModuleAccess.js
import { useAuth } from "../context/AuthContext.jsx";
import { canAccessModule, normalizeRole } from "../lib/permissions";

export function useModuleAccess(moduleKey) {
  const { currentRole, loading } = useAuth();
  const role = normalizeRole(currentRole);

  const canView = !moduleKey
    ? true
    : canAccessModule(role, moduleKey);

  return { role, canView, loading };
}
