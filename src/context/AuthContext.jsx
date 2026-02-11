// src/context/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useState,
  useRef,
} from "react";
import { getMemoryAccessToken } from "../lib/supabaseClient";

/**
 * AuthContext UNIVERSAL (TWA/WebView safe)
 * Fuente: /api/auth/session (cookie HttpOnly tg_at)
 *
 * EXPONE:
 * - Nuevo: currentRole, currentOrg, organizations, selectOrg, isAppRoot
 * - Legacy: role, currentOrgId, orgId, authenticated, ready (para páginas viejas)
 */

const AuthContext = createContext(null);

const LS_ORG_KEY = "tg_current_org_id";

async function fetchSession() {
  const headers = {
    "cache-control": "no-cache",
    pragma: "no-cache",
  };

  // ✅ Si venimos de PKCE exchange y guardamos token en memoria,
  // lo enviamos al backend para que pueda setear/renovar la cookie tg_at.
  const mem = getMemoryAccessToken?.();
  if (mem) headers["Authorization"] = `Bearer ${mem}`;

  const res = await fetch("/api/auth/session", {
    credentials: "include",
    headers,
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

  // NEW API
  const [currentRole, setCurrentRole] = useState(null);
  const [isAppRoot, setIsAppRoot] = useState(false);

  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);

  // Legacy aliases (computed)
  const role = currentRole;
  const currentOrgId = currentOrg?.id || null;
  const orgId = currentOrgId;

  // Legacy fields expected by páginas antiguas
  const authenticated = Boolean(user);
  const [ready, setReady] = useState(false);
  const didBootstrapOnceRef = useRef(false);

  const selectOrg = useCallback(
    (orgIdToSelect) => {
      if (!orgIdToSelect) return;

      try {
        localStorage.setItem(LS_ORG_KEY, orgIdToSelect);
      } catch {}

      setCurrentOrg((prev) => {
        if (prev?.id === orgIdToSelect) return prev;
        const found = Array.isArray(organizations)
          ? organizations.find((o) => o?.id === orgIdToSelect)
          : null;
        return found || { id: orgIdToSelect };
      });

      setOrganizations((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        if (arr.some((o) => o?.id === orgIdToSelect)) return arr;
        return [{ id: orgIdToSelect }, ...arr];
      });
    },
    [organizations]
  );

  const bootstrap = useCallback(async () => {
    setLoading(true);

    try {
      const { ok, data } = await fetchSession();

      if (!ok || !data || data.authenticated !== true) {
        setUser(null);
        setCurrentRole(null);
        setIsAppRoot(false);
        setOrganizations([]);
        setCurrentOrg(null);
        return;
      }

      setUser(data.user ?? null);

      const resolvedRole =
        data.currentRole ??
        data.current_role ??
        data.role ??
        data.app_role ??
        null;

      setCurrentRole(resolvedRole ? String(resolvedRole).toLowerCase() : null);
      setIsAppRoot(Boolean(data.is_app_root ?? data.isAppRoot ?? false));

      const serverOrgId =
        data.current_org_id ??
        data.currentOrgId ??
        data.org_id ??
        data.orgId ??
        null;

      let preferredOrgId = null;
      try {
        preferredOrgId = localStorage.getItem(LS_ORG_KEY);
      } catch {}

      const finalOrgId = preferredOrgId || serverOrgId || null;

      const orgsFromServer = Array.isArray(data.organizations)
        ? data.organizations
        : null;

      if (orgsFromServer && orgsFromServer.length > 0) {
        setOrganizations(orgsFromServer);

        const picked =
          (finalOrgId &&
            orgsFromServer.find((o) => o?.id === finalOrgId)?.id) ||
          orgsFromServer.find((o) => o?.id)?.id ||
          null;

        const orgObj = picked
          ? orgsFromServer.find((o) => o?.id === picked)
          : null;
        setCurrentOrg(orgObj || null);

        if (picked) {
          try {
            localStorage.setItem(LS_ORG_KEY, picked);
          } catch {}
        }
      } else {
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

      if (!didBootstrapOnceRef.current) {
        didBootstrapOnceRef.current = true;
        setReady(true);
      }
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
      ready,
      authenticated,
      user,
      isLoggedIn: Boolean(user),

      currentRole,
      isAppRoot,
      organizations,
      currentOrg,
      selectOrg,

      role,
      currentOrgId,
      orgId,

      refreshSession: bootstrap,
      logout,
    }),
    [
      loading,
      ready,
      authenticated,
      user,
      currentRole,
      isAppRoot,
      organizations,
      currentOrg,
      selectOrg,
      role,
      currentOrgId,
      orgId,
      bootstrap,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
