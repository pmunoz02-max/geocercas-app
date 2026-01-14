// src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useCallback, useState } from "react";

/**
 * AuthContext (UNIVERSAL / TWA-safe)
 * Fuente de verdad: /api/auth/session (cookie HttpOnly tg_at)
 *
 * Expone lo que esperan:
 * - ProtectedShell: loading, user, currentRole, isAppRoot
 * - RequireOrg: loading, user, currentOrg, organizations, selectOrg
 */

const AuthContext = createContext(null);

const LS_ORG_KEY = "tg_current_org_id";

async function fetchSession() {
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

  return { ok: res.ok, data };
}

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);

  const [user, setUser] = useState(null);

  const [currentRole, setCurrentRole] = useState(null);
  const [isAppRoot, setIsAppRoot] = useState(false);

  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);

  const selectOrg = useCallback((orgId) => {
    if (!orgId) return;
    try {
      localStorage.setItem(LS_ORG_KEY, orgId);
    } catch {}
    setCurrentOrg((prev) => (prev?.id === orgId ? prev : { id: orgId }));
    setOrganizations((prev) => {
      if (Array.isArray(prev) && prev.some((o) => o?.id === orgId)) return prev;
      return [{ id: orgId }, ...(Array.isArray(prev) ? prev : [])];
    });
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);

    try {
      const { ok, data } = await fetchSession();

      // no auth / backend error
      if (!ok || !data || data.authenticated !== true) {
        setUser(null);
        setCurrentRole(null);
        setIsAppRoot(false);
        setOrganizations([]);
        setCurrentOrg(null);
        return;
      }

      // user
      setUser(data.user ?? null);

      // ✅ role: soporta varias llaves por compatibilidad
      const role =
        data.currentRole ??
        data.current_role ??
        data.role ??
        data.app_role ??
        null;

      setCurrentRole(role);

      // ✅ is_app_root opcional si algún día lo mandas desde backend
      setIsAppRoot(Boolean(data.is_app_root ?? data.isAppRoot ?? false));

      // ✅ org_id
      const serverOrgId =
        data.current_org_id ??
        data.currentOrgId ??
        data.org_id ??
        data.orgId ??
        null;

      // Si usuario había seleccionado org antes, mantenla si coincide con serverOrgId
      let preferredOrgId = null;
      try {
        preferredOrgId = localStorage.getItem(LS_ORG_KEY);
      } catch {}

      const finalOrgId = preferredOrgId || serverOrgId || null;

      // organizations: si backend no manda lista, construimos mínimo
      const orgsFromServer = Array.isArray(data.organizations) ? data.organizations : null;
      if (orgsFromServer && orgsFromServer.length > 0) {
        setOrganizations(orgsFromServer);
        // si finalOrgId no está en la lista, cae al primero
        const found = finalOrgId && orgsFromServer.find((o) => o?.id === finalOrgId);
        const picked = found?.id || orgsFromServer.find((o) => o?.id)?.id || null;
        setCurrentOrg(picked ? orgsFromServer.find((o) => o?.id === picked) : null);
        if (picked) {
          try {
            localStorage.setItem(LS_ORG_KEY, picked);
          } catch {}
        }
      } else {
        // modo mínimo (suficiente para RequireOrg + filtros por currentOrg.id)
        if (finalOrgId) {
          setOrganizations([{ id: finalOrgId }]);
          setCurrentOrg({ id: finalOrgId });
          try {
            localStorage.setItem(LS_ORG_KEY, finalOrgId);
          } catch {}
        } else {
          setOrganizations([]);
          setCurrentOrg(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    try {
      localStorage.removeItem(LS_ORG_KEY);
    } catch {}

    setUser(null);
    setCurrentRole(null);
    setIsAppRoot(false);
    setOrganizations([]);
    setCurrentOrg(null);
    window.location.href = "/login";
  }, []);

  const value = useMemo(
    () => ({
      loading,
      user,

      // roles
      currentRole,
      isAppRoot,

      // org context
      organizations,
      currentOrg,
      selectOrg,

      // helpers
      refreshSession: bootstrap,
      logout,
    }),
    [loading, user, currentRole, isAppRoot, organizations, currentOrg, selectOrg, bootstrap, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
