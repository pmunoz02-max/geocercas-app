// src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * AuthContext – POSTLOGIN (WebView/TWA safe)
 * - No usa supabase.auth.getSession/getUser/setSession
 * - Bootstrapea desde /api/auth/session (cookies HttpOnly)
 * - Expone user + accessToken (solo memoria runtime) + currentOrgId
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  // Token solo en memoria (runtime). NO localStorage.
  const [accessToken, setAccessToken] = useState(null);

  // Org actual (idealmente viene del backend). Si falta, NO bloquea la app.
  const [currentOrgId, setCurrentOrgId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/auth/session", {
          credentials: "include",
          headers: { "cache-control": "no-cache" },
        });

        // Si falla el endpoint, tratamos como no-auth pero sin romper UI
        if (!res.ok) {
          if (!cancelled) {
            setAuthenticated(false);
            setUser(null);
            setAccessToken(null);
            setCurrentOrgId(null);
            setReady(true);
          }
          return;
        }

        const data = await res.json();

        if (!data?.authenticated) {
          if (!cancelled) {
            setAuthenticated(false);
            setUser(null);
            setAccessToken(null);
            setCurrentOrgId(null);
            setReady(true);
          }
          return;
        }

        if (!cancelled) {
          setAuthenticated(true);
          setUser(data.user ?? null);
          setAccessToken(data.access_token ?? null);

          // ✅ CLAVE: preferir current_org_id si viene; si no, org_id/default_org_id (sin bloquear)
          const org =
            data.current_org_id ?? data.org_id ?? data.default_org_id ?? null;
          setCurrentOrgId(org);

          setReady(true);
        }
      } catch (e) {
        console.error("[AuthContext bootstrap] error:", e);
        if (!cancelled) {
          setError(e);
          // No bloqueamos: dejamos la app en estado "ready" aunque sea no-auth
          setAuthenticated(false);
          setUser(null);
          setAccessToken(null);
          setCurrentOrgId(null);
          setReady(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  // Logout WebView-safe: backend borra cookies y redirige
  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch (e) {
      // aunque falle el fetch, igual limpiamos memoria
      console.warn("[logout] failed:", e);
    } finally {
      setAuthenticated(false);
      setUser(null);
      setAccessToken(null);
      setCurrentOrgId(null);
      setReady(true);
      // recarga dura para limpiar runtime en WebView/TWA
      window.location.href = "/login";
    }
  }

  const value = useMemo(
    () => ({
      loading,
      ready,
      error,
      authenticated,
      user,
      accessToken,
      currentOrgId,
      setCurrentOrgId,
      logout,
      // helper por compatibilidad (si en tu app hay checks)
      isLoggedIn: !!authenticated,
    }),
    [loading, ready, error, authenticated, user, accessToken, currentOrgId]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ✅ ESTO arregla tu build: AppHeader importa useAuth
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
