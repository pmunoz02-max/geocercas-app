// src/auth/AuthProvider.jsx
import React from "react";
import {
  AuthProvider as CoreAuthProvider,
  useAuth as coreUseAuth,
  useAuthSafe as coreUseAuthSafe,
} from "../context/AuthContext.jsx";

/**
 * AuthProvider ÚNICO (API público del proyecto)
 * ------------------------------------------------
 * Este archivo existe para evitar que haya 2 contexts diferentes.
 * Todo el proyecto debe importar SIEMPRE desde:
 *   - "../auth/AuthProvider.jsx"
 *
 * Internamente delega al AuthContext canónico (../context/AuthContext.jsx).
 */

// Provider único
export function AuthProvider({ children }) {
  return <CoreAuthProvider>{children}</CoreAuthProvider>;
}

/**
 * Hook estricto (mantiene throw si NO hay Provider)
 * Úsalo donde tengas certeza que estás dentro del Provider.
 */
export function useAuth() {
  const ctx = coreUseAuth();

  // Aliases de compatibilidad (por usos encontrados en el repo)
  return {
    ...ctx,

    // Muchos componentes usan "session" y "profile"
    // En tu AuthContext actual, "user" es la fuente real.
    session: ctx.user ?? null,
    profile: ctx.user ?? null,

    // Muchos usan signOut
    signOut: ctx.logout,

    // Algunos usan isAdmin
    // Ajusta si tu lógica real difiere
    isAdmin: String(ctx.currentRole || "").toLowerCase() === "admin",

    // Aliases para nombres usados en otras pantallas
    reloadAuth: ctx.refreshSession,
    reloadSession: ctx.refreshSession,

    // Algunos usan setCurrentOrg / orgs / orgsReady / authReady
    setCurrentOrg: (orgId) => ctx.selectOrg?.(orgId),
    orgs: ctx.organizations ?? [],
    orgsReady: Boolean(ctx.ready),
    authReady: Boolean(ctx.ready),

    // bestRole/trackerDomain: si existen en el futuro, aquí es donde se normaliza
  };
}

/**
 * Hook seguro (NUNCA lanza)
 * Ideal para guards/layouts tempranos.
 */
export function useAuthSafe() {
  const ctx = coreUseAuthSafe();

  // Misma compatibilidad que useAuth()
  return {
    ...ctx,
    session: ctx.user ?? null,
    profile: ctx.user ?? null,
    signOut: ctx.logout,
    isAdmin: String(ctx.currentRole || "").toLowerCase() === "admin",
    reloadAuth: ctx.refreshSession,
    reloadSession: ctx.refreshSession,
    setCurrentOrg: (orgId) => ctx.selectOrg?.(orgId),
    orgs: ctx.organizations ?? [],
    orgsReady: Boolean(ctx.ready),
    authReady: Boolean(ctx.ready),
  };
}

// Default export por si en algún lugar lo usan así
export default AuthProvider;