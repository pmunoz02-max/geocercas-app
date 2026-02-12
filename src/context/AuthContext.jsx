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

/**
 * AuthContext UNIVERSAL (TWA/WebView safe)
 * Fuente: /api/auth/session (cookie HttpOnly tg_at)
 *
 * EXPONE:
 * - Nuevo: currentRole, currentOrg, organizations, selectOrg, isAppRoot
 * - Legacy: role, currentOrgId, orgId, authenticated, ready
 */

const AuthContext = createContext(null);

const LS_ORG_KEY = "tg_current_org_id";

async function fetchSession() {
  const res = await fetch("/api/auth/session", {
    credentials: "include",
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
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

function normalizeRole(v) {
  if (!v) return null;
  return String(v).trim().toLowerCase();
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

      // isAppRoot (si backend lo manda)
      setIsAppRoot(Boolean(data.is_app_root ?? data.isAppRoot ?? false));

      // org id (tolerante)
      const serverOrgId =
        data.current_org_id ??
        data.currentOrgId ??
        data.current_orgId ??
        data.org_id ??
        data.orgId ??
        null;

      // lista de orgs (tolerante: organizations u orgs)
      const orgsFromServer = Array.isArray(data.organizations)
        ? data.organizations
        : Array.isArray(data.orgs)
        ? data.orgs
        : null;

      // respetar org seleccionada anteriormente si existe
      let preferredOrgId = null;
      try {
        preferredOrgId = localStorage.getItem(LS_ORG_KEY);
      } catch {}

      const finalOrgId = preferredOrgId || serverOrgId || null;

      if (orgsFromServer && orgsFromServer.length > 0) {
        // normaliza mínimo: {id,name,role}
        const normalized = orgsFromServer
          .map((o) => {
            const id = o?.id ?? o?.org_id ?? null;
            if (!id) return null;
            return {
              ...o,
              id,
              name: o?.name ?? o?.org_name ?? o?.title ?? "",
              role: normalizeRole(o?.role ?? o?.currentRole ?? o?.app_role),
            };
          })
          .filter(Boolean);

        setOrganizations(normalized);

        const pickedId =
          (finalOrgId && normalized.find((o) => o?.id === finalOrgId)?.id) ||
          normalized.find((o) => o?.id)?.id ||
          null;

        const orgObj = pickedId ? normalized.find((o) => o?.id === pickedId) : null;
        setCurrentOrg(orgObj || null);

        if (pickedId) {
          try {
            localStorage.setItem(LS_ORG_KEY, pickedId);
          } catch {}
        }

        // role: prefer backend currentRole keys; si no, usar role de la org seleccionada
        const resolvedRole =
          normalizeRole(
            data.currentRole ??
              data.current_role ??
              data.role ??
              data.app_role ??
              null
          ) || normalizeRole(orgObj?.role);

        setCurrentRole(resolvedRole);
      } else {
        // sin lista de orgs: fallback mínimo con org id
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

        // role si lo manda backend
        const resolvedRole = normalizeRole(
          data.currentRole ?? data.current_role ?? data.role ?? data.app_role ?? null
        );
        setCurrentRole(resolvedRole);
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
      // base
      loading,
      ready,
      authenticated,
      user,
      isLoggedIn: Boolean(user),

      // NEW
      currentRole,
      isAppRoot,
      organizations,
      currentOrg,
      selectOrg,

      // LEGACY
      role,
      currentOrgId,
      orgId,

      // helpers
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
