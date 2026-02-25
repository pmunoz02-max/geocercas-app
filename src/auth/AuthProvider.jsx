// src/auth/AuthProvider.jsx
import React from "react";
import {
  AuthProvider as CoreAuthProvider,
  useAuth as coreUseAuth,
} from "../context/AuthContext.jsx";

/**
 * API pública ÚNICA de Auth del proyecto
 * -------------------------------------
 * TODO el proyecto debe importar Auth desde:
 *   "@/auth/AuthProvider.jsx"
 *
 * Este wrapper:
 * - expone AuthProvider
 * - expone useAuth (estricto, puede lanzar si no hay provider)
 * - expone useAuthSafe (NUNCA lanza; try/catch + fallback)
 * - normaliza el shape (aliases: session, profile, signOut, etc.)
 */

export function AuthProvider({ children }) {
  return <CoreAuthProvider>{children}</CoreAuthProvider>;
}

function normalize(ctx) {
  const safe = ctx || {};

  return {
    ...safe,

    // Aliases compat
    session: safe.user ?? null,
    profile: safe.user ?? null,

    // signOut alias
    signOut: safe.logout,

    // isAdmin compat
    isAdmin: String(safe.currentRole || "").toLowerCase() === "admin",

    // reload compat
    reloadAuth: safe.refreshSession,
    reloadSession: safe.refreshSession,

    // org compat
    setCurrentOrg: (orgId) => safe.selectOrg?.(orgId),
    orgs: safe.organizations ?? [],
    orgsReady: Boolean(safe.ready),
    authReady: Boolean(safe.ready),
  };
}

/**
 * Hook estricto: mantiene el throw si NO hay Provider
 * (úsalo donde estés seguro que estás dentro del árbol con AuthProvider)
 */
export function useAuth() {
  const ctx = coreUseAuth();
  return normalize(ctx);
}

/**
 * Hook seguro: NUNCA lanza
 * Ideal para guards/layouts tempranos.
 */
export function useAuthSafe() {
  try {
    // Usamos el hook estricto y lo protegemos aquí,
    // en vez de depender de un coreUseAuthSafe que podría no ser safe.
    const ctx = coreUseAuth();
    return normalize(ctx);
  } catch (e) {
    // Fallback universal (sin provider o init parcial)
    return normalize({
      loading: true,
      ready: false,
      user: null,
      currentOrg: null,
      currentOrgId: null,
      currentRole: null,
      role: null,
      authenticated: false,
      organizations: [],
      selectOrg: () => {},
      logout: async () => {},
      refreshSession: async () => {},
    });
  }
}

export default AuthProvider;