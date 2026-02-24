// src/auth/AuthProvider.jsx
import React from "react";
import { AuthProvider as CoreAuthProvider, useAuth as coreUseAuth } from "../context/AuthContext.jsx";

/**
 * AuthProvider ÚNICO (API público del proyecto)
 * ------------------------------------------------
 * Todo el proyecto debe importar SIEMPRE desde:
 *   - "@/auth/AuthProvider.jsx"
 *
 * Internamente delega al AuthContext canónico (../context/AuthContext.jsx).
 */

// Provider único
export function AuthProvider({ children }) {
  return <CoreAuthProvider>{children}</CoreAuthProvider>;
}

/**
 * Normaliza el shape del contexto para compatibilidad con pantallas viejas.
 */
function normalizeAuth(ctx) {
  return {
    ...ctx,

    // compat: muchos componentes usan "session" y "profile"
    session: ctx?.user ?? null,
    profile: ctx?.user ?? null,

    // compat: muchos usan signOut()
    signOut: ctx?.logout,

    // compat: isAdmin
    isAdmin: String(ctx?.currentRole || "").toLowerCase() === "admin",

    // compat: reloadAuth/reloadSession
    reloadAuth: ctx?.refreshSession,
    reloadSession: ctx?.refreshSession,

    // compat: orgs / setters
    setCurrentOrg: (orgId) => ctx?.selectOrg?.(orgId),
    orgs: ctx?.organizations ?? [],
    orgsReady: Boolean(ctx?.ready),
    authReady: Boolean(ctx?.ready),
  };
}

/**
 * Hook estricto (mantiene throw si NO hay Provider)
 */
export function useAuth() {
  const ctx = coreUseAuth();
  return normalizeAuth(ctx);
}

/**
 * Hook seguro (NUNCA lanza)
 * - Si no hay Provider, devuelve un objeto seguro.
 * Ideal para guards/layouts tempranos.
 */
export function useAuthSafe() {
  try {
    const ctx = coreUseAuth();
    return normalizeAuth(ctx);
  } catch {
    // Fallback seguro cuando no hay Provider (o hay mismatch temporal)
    return normalizeAuth({
      user: null,
      ready: false,
      loading: true,

      currentOrg: null,
      organizations: [],

      currentRole: null,

      // no-ops seguros
      login: async () => ({ ok: false }),
      logout: async () => {},
      refreshSession: async () => {},
      selectOrg: () => {},
    });
  }
}

// Default export por si en algún lugar lo usan así
export default AuthProvider;