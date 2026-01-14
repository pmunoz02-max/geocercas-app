// src/context/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * AuthContext – POSTLOGIN (WebView/TWA safe)
 * - Bootstrapea desde /api/auth/session (cookies HttpOnly)
 * - authenticated === true SOLO cuando hay user + org + role
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [role, setRole] = useState(null);
  const [currentOrgId, setCurrentOrgId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        setLoading(true);
        setReady(false);
        setError(null);

        const res = await fetch("/api/auth/session", {
          credentials: "include",
          headers: {
            "cache-control": "no-cache",
            pragma: "no-cache",
          },
        });

        const raw = await res.text();
        let data = null;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch {
          data = null;
        }

        // Falla backend o no-auth
        if (!res.ok || !data || data.authenticated !== true) {
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

        const org =
          data.current_org_id ??
          data.currentOrgId ??
          data.org_id ??
          data.orgId ??
          data.default_org_id ??
          data.defaultOrgId ??
          null;

        const resolvedRole = data.role ?? data.app_role ?? null;

        // ⛔ CLAVE: NO marcamos authenticated hasta tener TODO
        if (!org || !resolvedRole) {
          // dejamos loading activo para evitar pantallas falsas
          return;
        }

        setUser(data.user ?? null);
        setAccessToken(data.access_token ?? data.accessToken ?? null);
        setRole(resolvedRole);
        setCurrentOrgId(org);
        setAuthenticated(true);
        setReady(true);
      } catch (e) {
        console.error("[AuthContext bootstrap] error:", e);
        if (!cancelled) {
          setError(e);
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

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {
      console.warn("[logout] failed:", e);
    } finally {
      setAuthenticated(false);
      setUser(null);
      setAccessToken(null);
      setRole(null);
      setCurrentOrgId(null);
      setReady(true);
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
      isLoggedIn: authenticated,
    }),
    [loading, ready, error, authenticated, user, accessToken, role, currentOrgId]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
