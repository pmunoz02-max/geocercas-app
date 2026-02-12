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
 * Auto-cura contexto multi-tenant llamando /api/auth/ensure-context (server-side),
 * y aplica el resultado inmediatamente.
 */

const AuthContext = createContext(null);

const LS_ORG_KEY = "tg_current_org_id";

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
    ...opts,
  });
  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, raw };
}

async function fetchSession() {
  return fetchJson("/api/auth/session");
}

async function ensureContextServerSide() {
  return fetchJson("/api/auth/ensure-context", { method: "POST" });
}

function normalizeRole(v) {
  if (!v) return null;
  return String(v).trim().toLowerCase();
}

function extractServerOrgId(data) {
  return (
    data?.current_org_id ??
    data?.currentOrgId ??
    data?.current_orgId ??
    data?.org_id ??
    data?.orgId ??
    null
  );
}

function extractServerRole(data) {
  return normalizeRole(
    data?.currentRole ?? data?.current_role ?? data?.role ?? data?.app_role ?? null
  );
}

function extractOrganizations(data) {
  const arr = Array.isArray(data?.organizations)
    ? data.organizations
    : Array.isArray(data?.orgs)
    ? data.orgs
    : null;

  if (!arr || arr.length === 0) return [];

  return arr
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
}

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  const [currentRole, setCurrentRole] = useState(null);
  const [isAppRoot, setIsAppRoot] = useState(false);

  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);

  const role = currentRole;
  const currentOrgId = currentOrg?.id || null;
  const orgId = currentOrgId;

  const authenticated = Boolean(user);
  const [ready, setReady] = useState(false);

  const didBootstrapOnceRef = useRef(false);
  const didEnsureContextThisRunRef = useRef(false);

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

  const applySessionData = useCallback((data) => {
    setUser(data?.user ?? null);
    setIsAppRoot(Boolean(data?.is_app_root ?? data?.isAppRoot ?? false));

    const serverOrgId = extractServerOrgId(data);
    const orgs = extractOrganizations(data);

    let preferredOrgId = null;
    try {
      preferredOrgId = localStorage.getItem(LS_ORG_KEY);
    } catch {}

    const finalOrgId = preferredOrgId || serverOrgId || null;

    if (orgs.length > 0) {
      setOrganizations(orgs);

      const pickedId =
        (finalOrgId && orgs.find((o) => o?.id === finalOrgId)?.id) ||
        orgs.find((o) => o?.id)?.id ||
        null;

      const orgObj = pickedId ? orgs.find((o) => o?.id === pickedId) : null;
      setCurrentOrg(orgObj || null);

      if (pickedId) {
        try {
          localStorage.setItem(LS_ORG_KEY, pickedId);
        } catch {}
      }

      const resolvedRole = extractServerRole(data) || normalizeRole(orgObj?.role);
      setCurrentRole(resolvedRole);
      return;
    }

    // Sin org list del server
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

    setCurrentRole(extractServerRole(data));
  }, []);

  // ✅ Aplica el resultado del ensure-context aunque session no lo devuelva todavía
  const applyEnsureContext = useCallback((payload) => {
    const org_id = payload?.data?.org_id ?? payload?.org_id ?? null;
    const roleRaw = payload?.data?.role ?? payload?.role ?? null;
    const roleNorm = normalizeRole(roleRaw);

    if (org_id) {
      setCurrentOrg({ id: org_id });
      setOrganizations((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        if (arr.some((o) => o?.id === org_id)) return arr;
        return [{ id: org_id }, ...arr];
      });
      try {
        localStorage.setItem(LS_ORG_KEY, org_id);
      } catch {}
    }

    if (roleNorm) setCurrentRole(roleNorm);
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    didEnsureContextThisRunRef.current = false;

    try {
      const s1 = await fetchSession();

      if (!s1.ok || !s1.data || s1.data.authenticated !== true) {
        setUser(null);
        setCurrentRole(null);
        setIsAppRoot(false);
        setOrganizations([]);
        setCurrentOrg(null);
        return;
      }

      applySessionData(s1.data);

      const orgId1 = extractServerOrgId(s1.data);
      const role1 = extractServerRole(s1.data);
      const orgs1 = extractOrganizations(s1.data);

      const missingOrg = !orgId1 && (!orgs1 || orgs1.length === 0);
      const missingRole = !role1;

      if ((missingOrg || missingRole) && !didEnsureContextThisRunRef.current) {
        didEnsureContextThisRunRef.current = true;

        const e1 = await ensureContextServerSide();

        if (!e1.ok) {
          console.warn("[AuthContext] ensure-context failed:", e1.data || e1.raw);
        } else {
          // ✅ llena contexto inmediatamente
          applyEnsureContext(e1.data);
        }

        // re-leer session para quedar consistente si el server ya sabe devolver orgs/role
        const s2 = await fetchSession();
        if (s2.ok && s2.data && s2.data.authenticated === true) {
          applySessionData(s2.data);
        }
      }
    } finally {
      setLoading(false);
      if (!didBootstrapOnceRef.current) {
        didBootstrapOnceRef.current = true;
        setReady(true);
      }
    }
  }, [applySessionData, applyEnsureContext]);

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

export function useAuthSafe() {
  return useContext(AuthContext);
}
