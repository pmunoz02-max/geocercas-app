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

const AuthContext = createContext(null);
const LS_ORG_KEY = "tg_current_org_id";

const PUBLIC_ROUTES = [
  "/login",
  "/reset-password",
  "/forgot-password",
  "/auth/callback",
];

function isPublicRoutePath(pathname) {
  const p = (pathname || "").toLowerCase();
  return PUBLIC_ROUTES.some((r) => p === r || p.startsWith(r + "/"));
}

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

  const [currentRole, setCurrentRole] = useState(null);
  const [isAppRoot, setIsAppRoot] = useState(false);

  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);

  const authenticated = Boolean(user);
  const [ready, setReady] = useState(false);
  const didBootstrapOnceRef = useRef(false);

  const bootstrap = useCallback(async () => {
    if (
      typeof window !== "undefined" &&
      isPublicRoutePath(window.location.pathname)
    ) {
      setLoading(false);
      setUser(null);
      setCurrentRole(null);
      setIsAppRoot(false);
      setOrganizations([]);
      setCurrentOrg(null);

      if (!didBootstrapOnceRef.current) {
        didBootstrapOnceRef.current = true;
        setReady(true);
      }
      return;
    }

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

      // ✅ ORG: SOLO DESDE BACKEND
      const serverOrgId =
        data.current_org_id ??
        data.currentOrgId ??
        data.org_id ??
        data.orgId ??
        null;

      const orgsFromServer = Array.isArray(data.organizations)
        ? data.organizations
        : serverOrgId
        ? [{ id: serverOrgId }]
        : [];

      setOrganizations(orgsFromServer);

      const orgObj =
        orgsFromServer.find((o) => o?.id === serverOrgId) || null;

      setCurrentOrg(orgObj);

      // Guardar SOLO la org válida del backend (opcional)
      if (serverOrgId) {
        try {
          localStorage.setItem(LS_ORG_KEY, serverOrgId);
        } catch {}
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
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
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

      // legacy aliases
      role: currentRole,
      currentOrgId: currentOrg?.id || null,
      orgId: currentOrg?.id || null,

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
      bootstrap,
      logout,
    ]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
