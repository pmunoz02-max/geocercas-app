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
 * Multi-tenant safe
 * Reset-password safe
 */

const AuthContext = createContext(null);

const LS_ORG_KEY = "tg_current_org_id";

/* =========================
   FINGERPRINT (diagnóstico)
========================= */

const AUTH_CTX_INSTANCE_ID = `AUTHCTX_${Math.random().toString(16).slice(2)}_${Date.now()}`;

try {
  if (typeof window !== "undefined") {
    window.__TG_AUTHCTX_IDS = window.__TG_AUTHCTX_IDS || [];
    window.__TG_AUTHCTX_IDS.push(AUTH_CTX_INSTANCE_ID);
    window.__TG_AUTHCTX_LAST = AUTH_CTX_INSTANCE_ID;
    // eslint-disable-next-line no-console
    console.log("[AUTHCTX] module instance:", AUTH_CTX_INSTANCE_ID);
  }
} catch {}

/* =========================
   UTILIDADES
========================= */

function isPublicAuthPath(pathname) {
  const p = String(pathname || "/").toLowerCase();

  if (p === "/login") return true;
  if (p === "/reset-password") return true;
  if (p.startsWith("/auth/")) return true;
  if (p === "/tracker-gps" || p.startsWith("/tracker-gps")) return true;

  return false;
}

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
    data?.org_id ??
    data?.orgId ??
    null
  );
}

function extractServerRole(data) {
  return normalizeRole(
    data?.currentRole ??
      data?.current_role ??
      data?.role ??
      data?.app_role ??
      null
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

/* =========================
   PROVIDER
========================= */

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  const [user, setUser] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);
  const [isAppRoot, setIsAppRoot] = useState(false);

  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);

  const didBootstrapOnceRef = useRef(false);
  const didEnsureContextThisRunRef = useRef(false);

  const [path, setPath] = useState(() => {
    try {
      return typeof window !== "undefined" ? window.location.pathname : "/";
    } catch {
      return "/";
    }
  });

  // FINGERPRINT: marca que el provider de ESTA instancia se montó
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.__TG_AUTH_PROVIDER_MOUNTED = AUTH_CTX_INSTANCE_ID;
        // eslint-disable-next-line no-console
        console.log("[AUTHCTX] provider mounted for:", AUTH_CTX_INSTANCE_ID);
      }
    } catch {}
  }, []);

  useEffect(() => {
    function onNav() {
      try {
        setPath(window.location.pathname || "/");
      } catch {}
    }

    window.addEventListener("popstate", onNav);
    return () => window.removeEventListener("popstate", onNav);
  }, []);

  const selectOrg = useCallback(
    (orgIdToSelect) => {
      if (!orgIdToSelect) return;

      try {
        localStorage.setItem(LS_ORG_KEY, orgIdToSelect);
      } catch {}

      const found = organizations.find((o) => o?.id === orgIdToSelect);

      setCurrentOrg(found || { id: orgIdToSelect });

      setOrganizations((prev) => {
        if (prev.some((o) => o?.id === orgIdToSelect)) return prev;
        return [{ id: orgIdToSelect }, ...prev];
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
        orgs[0]?.id ||
        null;

      const orgObj = pickedId ? orgs.find((o) => o?.id === pickedId) : null;

      setCurrentOrg(orgObj || null);

      if (pickedId) {
        try {
          localStorage.setItem(LS_ORG_KEY, pickedId);
        } catch {}
      }

      setCurrentRole(extractServerRole(data) || normalizeRole(orgObj?.role));

      return;
    }

    if (finalOrgId) {
      setOrganizations([{ id: finalOrgId }]);
      setCurrentOrg({ id: finalOrgId });
    } else {
      setOrganizations([]);
      setCurrentOrg(null);
    }

    setCurrentRole(extractServerRole(data));
  }, []);

  const applyEnsureContext = useCallback((payload) => {
    const org_id = payload?.data?.org_id ?? payload?.org_id ?? null;
    const roleRaw = payload?.data?.role ?? payload?.role ?? null;

    if (org_id) {
      setCurrentOrg({ id: org_id });
      setOrganizations((prev) => {
        if (prev.some((o) => o?.id === org_id)) return prev;
        return [{ id: org_id }, ...prev];
      });

      try {
        localStorage.setItem(LS_ORG_KEY, org_id);
      } catch {}
    }

    if (roleRaw) {
      setCurrentRole(normalizeRole(roleRaw));
    }
  }, []);

  const bootstrap = useCallback(async () => {
    if (isPublicAuthPath(path)) {
      setLoading(false);
      if (!didBootstrapOnceRef.current) {
        didBootstrapOnceRef.current = true;
        setReady(true);
      }
      return;
    }

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

      const missingOrg = !orgId1 && orgs1.length === 0;
      const missingRole = !role1;

      if ((missingOrg || missingRole) && !didEnsureContextThisRunRef.current) {
        didEnsureContextThisRunRef.current = true;

        const e1 = await ensureContextServerSide();

        if (e1.ok) {
          applyEnsureContext(e1.data);
        }

        const s2 = await fetchSession();
        if (s2.ok && s2.data?.authenticated === true) {
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
  }, [applySessionData, applyEnsureContext, path]);

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
      authenticated: Boolean(user),
      user,
      isLoggedIn: Boolean(user),

      currentRole,
      isAppRoot,
      organizations,
      currentOrg,
      selectOrg,

      role: currentRole,
      currentOrgId: currentOrg?.id || null,
      orgId: currentOrg?.id || null,

      refreshSession: bootstrap,
      logout,
    }),
    [
      loading,
      ready,
      user,
      currentRole,
      isAppRoot,
      organizations,
      currentOrg,
      selectOrg,
      bootstrap,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* =========================
   HOOKS
========================= */

const SAFE_FALLBACK = {
  loading: true,
  ready: false,
  authenticated: false,
  user: null,
  isLoggedIn: false,

  currentRole: null,
  isAppRoot: false,
  organizations: [],
  currentOrg: null,
  selectOrg: () => {},

  role: null,
  currentOrgId: null,
  orgId: null,

  refreshSession: async () => {},
  logout: async () => {},
};

// 🔥 CAMBIO UNIVERSAL:
// NO tiramos throw (evita pantalla negra). Logueamos fingerprint para detectar duplicación.
export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    try {
      // eslint-disable-next-line no-console
      console.error("[AUTHCTX] useAuth() without provider!", {
        instance: AUTH_CTX_INSTANCE_ID,
        mountedProviderFor: typeof window !== "undefined" ? window.__TG_AUTH_PROVIDER_MOUNTED : null,
        seenInstances: typeof window !== "undefined" ? window.__TG_AUTHCTX_IDS : null,
        path: typeof window !== "undefined" ? window.location?.pathname : null,
      });
    } catch {}
    return SAFE_FALLBACK;
  }

  return ctx;
}

export function useAuthSafe() {
  const ctx = useContext(AuthContext);
  return ctx ?? SAFE_FALLBACK;
}