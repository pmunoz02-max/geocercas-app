// src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * AuthContext – POSTLOGIN (WebView/TWA safe)
 * - NO usa supabase.auth.getSession/getUser/setSession (por WebView/TWA)
 * - Bootstrapea desde /api/auth/session (cookies HttpOnly)
 * - Exponemos: authenticated, user, role, currentOrgId, accessToken (solo memoria runtime)
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

  // Rol actual (si el backend lo envía)
  const [role, setRole] = useState(null);

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
          headers: {
            "cache-control": "no-cache",
            pragma: "no-cache",
          },
        });

        // Leemos como texto primero para evitar crashes si el backend devuelve HTML / texto
        const raw = await res.text();
        let data = null;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch {
          data = null;
        }

        // Si el endpoint falla (500, 401, etc.), dejamos estado no-auth pero "ready"
        if (!res.ok) {
          if (!cancelled) {
            setAuthenticated(false);
            setUser(null);
            setAccessToken(null);
            setRole(null);
            setCurrentOrgId(null);
            setReady(true);
          }
          return;
        }

        // Si viene respuesta rara, también “no-auth” sin colgar UI
        if (!data || data.authenticated !== true) {
          if (!cancelled) {
            setAuthenticated(false);
            setUser(null);
            setAccessToken(null);
            setRole(null);
            setCurrentOrgId(null);
            setReady(true);
          }
          return;
        }

        if (cancelled) return;

        setAuthenticated(true);
        setUser(data.user ?? null);

        // Algunos backends devuelven access_token, otros accessToken
        setAccessToken(data.access_token ?? data.accessToken ?? null);

        // role puede venir como role / app_role
        setRole(data.role ?? data.app_role ?? null);

        // ✅ CLAVE: preferir current_org_id si viene; si no, org_id/default_org_id (sin bloquear)
        const org =
          data.current_org_id ??
          data.currentOrgId ??
          data.org_id ??
          data.orgId ??
          data.default_org_id ??
          data.defaultOrgId ??
          null;

        setCurrentOrgId(org);
        setReady(true);
      } catch (e) {
        console.error("[AuthContext bootstrap] error:", e);
        if (!cancelled) {
          setError(e);
          // No bloqueamos: dejamos la app en estado ready aunque sea no-auth
          setAuthenticated(false);
          setUser(null);
          setAccessToken(null);
          setRole(null);
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

  // Logout WebView-safe: backend borra cookies
  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch (e) {
      console.warn("[logout] failed:", e);
    } finally {
      setAuthenticated(false);
      setUser(null);
      setAccessToken(null);
      setRole(null);
      setCurrentOrgId(null);
      setReady(true);
      // Recarga dura para limpiar runtime en WebView/TWA
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
      role,
      currentOrgId,
      setCurrentOrgId,
      logout,
      isLoggedIn: !!authenticated,
    }),
    [loading, ready, error, authenticated, user, accessToken, role, currentOrgId]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ✅ ESTO arregla tu build: AppHeader importa useAuth
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
