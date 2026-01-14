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
 * - Legacy: role, currentOrgId, orgId, authenticated, ready (para páginas viejas)
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

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // NEW API
  const [currentRole, setCurrentRole] = useState(null);
  const [isAppRoot, setIsAppRoot] = useState(false);

  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);

  // Legacy aliases (computed)
  const role = currentRole; // legacy alias
  const currentOrgId = currentOrg?.id || null; // legacy alias
  const orgId = currentOrgId; // another alias

  // Legacy fields expected by páginas antiguas
  const authenticated = Boolean(user); // legacy alias
  const [ready, setReady] = useState(false); // legacy: "AuthContext ya hidrató al menos una vez"
  const didBootstrapOnceRef = useRef(false);

  const selectOrg = useCallback(
    (orgIdToSelect) => {
      if (!orgIdToSelect) return;

      try {
        localStorage.setItem(LS_ORG_KEY, orgIdToSelect);
      } catch {}

      // si ya tenemos el objeto en organizations lo usamos
      setCurrentOrg((prev) => {
        if (prev?.id === orgIdToSelect) return prev;
        const found = Array.isArray(organizations)
          ? organizations.find((o) => o?.id === orgIdToSelect)
          : null;
        return found || { id: orgIdToSelect };
      });

      // asegurar que organizations contenga al menos ese id
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

      // role (tolerante a múltiples llaves)
      const resolvedRole =
        data.currentRole ??
        data.current_role ??
        data.role ??
        data.app_role ??
        null;

      setCurrentRole(resolvedRole ? String(resolvedRole).toLowerCase() : null);

      // isAppRoot si algún día lo envías desde backend
      setIsAppRoot(Boolean(data.is_app_root ?? data.isAppRoot ?? false));

      // org id (tolerante)
      const serverOrgId =
        data.current_org_id ??
        data.currentOrgId ??
        data.org_id ??
        data.orgId ??
        null;

      // respetar org seleccionada anteriormente si existe, si no usar la del server
      let preferredOrgId = null;
      try {
        preferredOrgId = localStorage.getItem(LS_ORG_KEY);
      } catch {}

      const finalOrgId = preferredOrgId || serverOrgId || null;

      // Si backend manda lista de orgs, úsala; si no, crea mínimo con id
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

      // ✅ Marca "ready" una vez que el primer bootstrap terminó (ok o no)
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
      ready, // ✅ legacy
      authenticated, // ✅ legacy
      user,
      isLoggedIn: Boolean(user),

      // NEW
      currentRole,
      isAppRoot,
      organizations,
      currentOrg,
      selectOrg,

      // LEGACY (para páginas viejas)
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
