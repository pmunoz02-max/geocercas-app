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
import { supabase } from "@/lib/supabaseClient.js";
import { isTrackerGpsPath } from "@/lib/trackerFlow";

/**
 * AuthContext UNIVERSAL (TWA/WebView safe)
 * Fuente: /api/auth/session (cookie HttpOnly tg_at)
 * Multi-tenant safe
 * Reset-password safe
 *
 * FIX 2026-02-28:
 * - Evitar contaminación de org global por roles tracker (multi-rol owner+tracker)
 * - localStorage tg_current_org_id solo aplica a orgs NO-tracker
 *
 * FIX 2026-04-22:
 * - currentOrgId SIEMPRE debe pertenecer a la lista real de organizaciones resueltas
 * - si serverOrgId o localStorage apuntan a una org inválida, hacer fallback a la primera org válida
 * - persistir inmediatamente el fallback en localStorage y servidor
 */

const AuthContext = createContext(null);
const LS_ORG_KEY = "tg_current_org_id";

/* =========================
   FINGERPRINT (diagnóstico)
========================= */


const AUTH_CTX_INSTANCE_ID = `AUTHCTX_${Math.random().toString(16).slice(2)}_${Date.now()}`;
const DEBUG_AUTH_CTX = import.meta.env.DEV;
function authCtxDebug(...args) {
  if (DEBUG_AUTH_CTX) console.log(...args);
}
try {
  if (typeof window !== "undefined") {
    window.__TG_AUTHCTX_IDS = window.__TG_AUTHCTX_IDS || [];
    window.__TG_AUTHCTX_IDS.push(AUTH_CTX_INSTANCE_ID);
    window.__TG_AUTHCTX_LAST = AUTH_CTX_INSTANCE_ID;
    authCtxDebug("[AUTHCTX] module instance:", AUTH_CTX_INSTANCE_ID);
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
  if (isTrackerGpsPath(p)) return true;

  return false;
}

function isTrackerUiPath(pathname) {
  const p = String(pathname || "/").toLowerCase();
  return p === "/tracker" || p.startsWith("/tracker");
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

function toBoolLoose(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function extractServerOrgId(data) {
  return data?.current_org_id ?? data?.currentOrgId ?? data?.org_id ?? data?.orgId ?? null;
}

function extractServerRole(data) {
  return normalizeRole(data?.currentRole ?? data?.current_role ?? data?.role ?? data?.app_role ?? null);
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

function extractCanSwitchOrganizations(data) {
  const direct =
    data?.can_switch_orgs ??
    data?.canSwitchOrgs ??
    data?.can_switch_organizations ??
    data?.canSwitchOrganizations ??
    data?.internal_multi_org_admin ??
    data?.is_internal_multi_org_admin ??
    null;

  if (toBoolLoose(direct)) return true;

  const user = data?.user || null;
  const appMeta = user?.app_metadata || {};
  const userMeta = user?.user_metadata || {};

  return toBoolLoose(
    appMeta?.can_switch_orgs ||
      appMeta?.internal_multi_org_admin ||
      userMeta?.can_switch_orgs ||
      userMeta?.internal_multi_org_admin
  );
}

function isNonTrackerRole(role) {
  const r = normalizeRole(role);
  return r && r !== "tracker";
}

/**
 * Decide si un orgId guardado en localStorage es aceptable como "org global".
 * Regla universal: NO permitimos que el org global quede en una org donde el rol sea tracker.
 */
function sanitizePreferredOrgId(preferredOrgId, orgs) {
  if (!preferredOrgId) return null;
  if (!Array.isArray(orgs) || orgs.length === 0) return null;

  const found = orgs.find((o) => o?.id === preferredOrgId);
  if (!found) return null;
  if (!isNonTrackerRole(found?.role)) return null;

  return found.id;
}

function pickBestOrgId({ serverOrgId, preferredOrgId, orgs, allowPreferred = true }) {
  const organizations = Array.isArray(orgs) ? orgs.filter((o) => o?.id) : [];
  if (organizations.length === 0) {
    return {
      pickedId: serverOrgId || preferredOrgId || null,
      serverOrgIdValid: false,
      preferredOrgIdValid: false,
    };
  }

  const validServerOrgId =
    serverOrgId && organizations.some((o) => o?.id === serverOrgId) ? serverOrgId : null;

  const validPreferredOrgId =
    allowPreferred ? sanitizePreferredOrgId(preferredOrgId, organizations) : null;

  const firstNonTracker = organizations.find((o) => isNonTrackerRole(o?.role));
  const firstAny = organizations[0] || null;

  const pickedId = validServerOrgId || validPreferredOrgId || firstNonTracker?.id || firstAny?.id || null;

  return {
    pickedId,
    serverOrgIdValid: Boolean(validServerOrgId),
    preferredOrgIdValid: Boolean(validPreferredOrgId),
  };
}

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);
  const [isAppRoot, setIsAppRoot] = useState(false);
  const [canSwitchOrganizations, setCanSwitchOrganizations] = useState(false);

  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [resolvedOrgId, setResolvedOrgId] = useState(null);
  const [resolvedRole, setResolvedRole] = useState(null);
  const [switchingOrg, setSwitchingOrg] = useState(false);

  const didBootstrapOnceRef = useRef(false);
  const didEnsureContextThisRunRef = useRef(false);

  const [path, setPath] = useState(() => {
    try {
      return typeof window !== "undefined" ? window.location.pathname : "/";
    } catch {
      return "/";
    }
  });

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.__TG_AUTH_PROVIDER_MOUNTED = AUTH_CTX_INSTANCE_ID;
        authCtxDebug("[AUTHCTX] provider mounted for:", AUTH_CTX_INSTANCE_ID);
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

  const persistCurrentOrgServer = useCallback(async (orgIdToSelect) => {
    if (!orgIdToSelect) return false;

    try {
      const {
        data: { session: currentSession },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("SET CURRENT ORG FAILED", {
          fn: "set_current_org",
          error: sessionError,
        });
        return false;
      }

      const accessToken = currentSession?.access_token || null;

      authCtxDebug("SET CURRENT ORG TRY", {
        fn: "set_current_org",
        orgId: orgIdToSelect,
        hasSession: !!currentSession,
        userId: currentSession?.user?.id || null,
        tokenPrefix: accessToken ? accessToken.slice(0, 16) : null,
      });

      if (!accessToken) {
        console.error("SET CURRENT ORG FAILED", {
          fn: "set_current_org",
          error: "Missing access token",
        });
        return false;
      }

      const { data, error } = await supabase.functions.invoke("set-current-org", {
        body: { org_id: orgIdToSelect },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!error) {
        authCtxDebug("SET CURRENT ORG SUCCESS", { fn: "set_current_org", data });
        return true;
      }

      console.error("SET CURRENT ORG FAILED", { fn: "set_current_org", error });
    } catch (e) {
      console.error("SET CURRENT ORG FAILED", { fn: "set_current_org", error: e });
    }

    try {
      authCtxDebug("SET CURRENT ORG FALLBACK", {
        fn: "rpc_set_current_org",
        orgId: orgIdToSelect,
      });

      const { error, status } = await supabase.rpc("rpc_set_current_org", {
        p_org_id: orgIdToSelect,
      });

      if (!error) return true;

      console.error("SET CURRENT ORG FAILED", {
        fn: "rpc_set_current_org",
        status,
        error,
      });
    } catch (e) {
      console.error("SET CURRENT ORG FAILED", {
        fn: "rpc_set_current_org",
        error: e,
      });
    }

    return false;
  }, []);

  /**
   * Aplica session data sin contaminar org global por tracker.
   */
  const applySessionData = useCallback(
    (data) => {
      setUser(data?.user ?? null);
      setIsAppRoot(Boolean(data?.is_app_root ?? data?.isAppRoot ?? false));
      setCanSwitchOrganizations(extractCanSwitchOrganizations(data));

      const serverOrgId = extractServerOrgId(data);
      const serverRole = extractServerRole(data);
      const orgs = extractOrganizations(data);

      let preferredOrgId = null;
      try {
        preferredOrgId = localStorage.getItem(LS_ORG_KEY);
      } catch {}

      const allowPreferred = !isTrackerUiPath(path);

      const { pickedId, serverOrgIdValid, preferredOrgIdValid } = pickBestOrgId({
        serverOrgId,
        preferredOrgId,
        orgs,
        allowPreferred,
      });

      if (orgs.length > 0) {
        setOrganizations(orgs);

        const orgObj = pickedId ? orgs.find((o) => o?.id === pickedId) || null : null;
        const pickedRole = serverRole || normalizeRole(orgObj?.role) || null;

        if (serverOrgId && !serverOrgIdValid && pickedId) {
          console.warn("[AUTHCTX] invalid server currentOrgId replaced", {
            invalidOrgId: serverOrgId,
            fallbackOrgId: pickedId,
          });
        }

        if (allowPreferred && preferredOrgId && !preferredOrgIdValid && pickedId) {
          console.warn("[AUTHCTX] invalid stored currentOrgId replaced", {
            invalidOrgId: preferredOrgId,
            fallbackOrgId: pickedId,
          });
        }

        setCurrentOrg(orgObj || null);
        setResolvedOrgId(pickedId || null);
        setResolvedRole(pickedRole);
        setCurrentRole(pickedRole);

        if (pickedId && isNonTrackerRole(orgObj?.role) && !isTrackerUiPath(path)) {
          try {
            localStorage.setItem(LS_ORG_KEY, pickedId);
          } catch {}
        } else if (!pickedId) {
          try {
            localStorage.removeItem(LS_ORG_KEY);
          } catch {}
        }

        if (pickedId && pickedId !== serverOrgId) {
          void persistCurrentOrgServer(pickedId);
        }

        return;
      }

      const finalOrgId = serverOrgId || null;

      if (finalOrgId) {
        setOrganizations([{ id: finalOrgId }]);
        setCurrentOrg({ id: finalOrgId });
        setResolvedOrgId(finalOrgId);
      } else {
        setOrganizations([]);
        setCurrentOrg(null);
        setResolvedOrgId(null);
        try {
          localStorage.removeItem(LS_ORG_KEY);
        } catch {}
      }

      setResolvedRole(serverRole || null);
      setCurrentRole(serverRole || null);
    },
    [path, persistCurrentOrgServer]
  );

  const applyEnsureContext = useCallback(
    (payload) => {
      const data = payload?.data ?? payload ?? {};
      const org_id = data?.current_org_id ?? data?.active_org_id ?? data?.org_id ?? null;
      const roleRaw = data?.current_role ?? data?.role ?? null;
      const roleNorm = normalizeRole(roleRaw);
      const orgs = extractOrganizations(data);
      const currentOrgPayload = data?.current_org || data?.currentOrg || null;

      if (orgs.length > 0) {
        setOrganizations(orgs);
      }

      if (org_id) {
        const normalizedCurrentOrgId = currentOrgPayload?.id ?? currentOrgPayload?.org_id ?? org_id;
        const orgFromList = orgs.find((org) => org?.id === normalizedCurrentOrgId) || null;
        const finalOrgId = orgFromList?.id || normalizedCurrentOrgId;

        setResolvedOrgId(finalOrgId);
        setCurrentOrg((prev) => {
          if (orgFromList) return orgFromList;
          return {
            ...(prev?.id === finalOrgId ? prev : {}),
            ...(currentOrgPayload || {}),
            id: finalOrgId,
            role: normalizeRole(currentOrgPayload?.role) || roleNorm || prev?.role || null,
          };
        });

        if (orgs.length === 0) {
          setOrganizations((prev) => {
            if (prev.some((o) => o?.id === finalOrgId)) return prev;
            return [{ id: finalOrgId }, ...prev];
          });
        }

        if (isNonTrackerRole(roleNorm) && !isTrackerUiPath(path)) {
          try {
            localStorage.setItem(LS_ORG_KEY, finalOrgId);
          } catch {}
        }
      }

      if (roleRaw) {
        setResolvedRole(roleNorm);
        setCurrentRole(roleNorm);
      }
    },
    [path]
  );

  const clearResolvedAuthState = useCallback(() => {
    setCurrentRole(null);
    setResolvedRole(null);
    setIsAppRoot(false);
    setCanSwitchOrganizations(false);
    setOrganizations([]);
    setCurrentOrg(null);
    setResolvedOrgId(null);
  }, []);

  const hydrateClientContext = useCallback(
    async (sessionUser) => {
      const userId = sessionUser?.id || null;

      if (!userId) {
        clearResolvedAuthState();
        return;
      }

      let membershipRows = [];

      try {
        const { data, error } = await supabase
          .from("memberships")
          .select("org_id, role, is_default, revoked_at")
          .eq("user_id", userId)
          .is("revoked_at", null)
          .order("is_default", { ascending: false });

        if (!error && Array.isArray(data)) {
          membershipRows = data;
        }
      } catch {}

      if (membershipRows.length === 0) {
        try {
          const { data, error } = await supabase
            .from("user_organizations")
            .select("org_id, role")
            .eq("user_id", userId);

          if (!error && Array.isArray(data)) {
            membershipRows = data.map((row, idx) => ({
              ...row,
              is_default: idx === 0,
              revoked_at: null,
            }));
          }
        } catch {}
      }

      const orgIds = Array.from(new Set(membershipRows.map((row) => row?.org_id).filter(Boolean)));

      let orgRows = [];
      if (orgIds.length > 0) {
        try {
          const { data, error } = await supabase.from("organizations").select("id, name, slug").in("id", orgIds);

          if (!error && Array.isArray(data)) {
            orgRows = data;
          }
        } catch {}
      }

      const orgById = new Map(orgRows.map((row) => [row.id, row]));
      const organizationsResolved = Array.from(
        new Map(
          membershipRows
            .filter((row) => row?.org_id)
            .map((row) => {
              const orgMeta = orgById.get(row.org_id) || null;
              return [
                row.org_id,
                {
                  id: row.org_id,
                  name: orgMeta?.name || "",
                  slug: orgMeta?.slug || null,
                  role: normalizeRole(row?.role),
                },
              ];
            })
        ).values()
      );

      let preferredOrgId = null;
      try {
        preferredOrgId = localStorage.getItem(LS_ORG_KEY);
      } catch {}

      const { pickedId, preferredOrgIdValid } = pickBestOrgId({
        serverOrgId: null,
        preferredOrgId,
        orgs: organizationsResolved,
        allowPreferred: !isTrackerUiPath(path),
      });

      if (preferredOrgId && !preferredOrgIdValid && pickedId) {
        console.warn("[AUTHCTX] invalid stored currentOrgId replaced", {
          invalidOrgId: preferredOrgId,
          fallbackOrgId: pickedId,
        });
      }

      const pickedOrg = pickedId
        ? organizationsResolved.find((org) => org?.id === pickedId) || null
        : null;

      setIsAppRoot(
        Boolean(sessionUser?.app_metadata?.is_app_root ?? sessionUser?.app_metadata?.isAppRoot)
      );
      setCanSwitchOrganizations(
        extractCanSwitchOrganizations({ user: sessionUser, organizations: organizationsResolved }) ||
          organizationsResolved.filter((org) => isNonTrackerRole(org?.role)).length > 1
      );
      setOrganizations(organizationsResolved);
      setCurrentOrg(pickedOrg || null);

      const hydratedRole =
        normalizeRole(pickedOrg?.role) ||
        normalizeRole(sessionUser?.app_metadata?.role) ||
        normalizeRole(sessionUser?.user_metadata?.role) ||
        null;

      setResolvedOrgId(pickedOrg?.id || null);
      setResolvedRole(hydratedRole);
      setCurrentRole(hydratedRole);

      if (pickedOrg?.id && isNonTrackerRole(pickedOrg?.role) && !isTrackerUiPath(path)) {
        try {
          localStorage.setItem(LS_ORG_KEY, pickedOrg.id);
        } catch {}
      } else {
        try {
          localStorage.removeItem(LS_ORG_KEY);
        } catch {}
      }

      if (pickedOrg?.id) {
        void persistCurrentOrgServer(pickedOrg.id);
      }
    },
    [clearResolvedAuthState, path, persistCurrentOrgServer]
  );

  /**
   * selectOrg = selección explícita del usuario desde selector de org.
   * Regla universal: solo persistimos como "org global" si NO es tracker.
   */
  const selectOrg = useCallback(
    async (orgIdToSelect) => {
      if (!orgIdToSelect) return;

      if (!canSwitchOrganizations && currentOrg?.id && currentOrg.id !== orgIdToSelect) {
        return;
      }

      const found = organizations.find((o) => o?.id === orgIdToSelect);

      setCurrentOrg(found || { id: orgIdToSelect });
      setResolvedOrgId(orgIdToSelect);

      setOrganizations((prev) => {
        if (prev.some((o) => o?.id === orgIdToSelect)) return prev;
        return [{ id: orgIdToSelect }, ...prev];
      });

      if (isNonTrackerRole(found?.role)) {
        try {
          localStorage.setItem(LS_ORG_KEY, orgIdToSelect);
        } catch {}
      }

      const nextRole = normalizeRole(found?.role) || normalizeRole(currentRole) || null;
      setResolvedRole(nextRole);
      setCurrentRole(nextRole);

      setSwitchingOrg(true);

      try {
        await persistCurrentOrgServer(orgIdToSelect);

        const s1 = await fetchSession();
        if (s1.ok && s1.data?.authenticated === true) {
          applySessionData(s1.data);
        }
      } finally {
        setSwitchingOrg(false);
      }
    },
    [
      applySessionData,
      canSwitchOrganizations,
      currentOrg?.id,
      currentRole,
      organizations,
      persistCurrentOrgServer,
    ]
  );

  const bootstrap = useCallback(async () => {
    authCtxDebug("[AUTHCTX] bootstrap start");
    setLoading(true);
    didEnsureContextThisRunRef.current = false;

    try {
      const {
        data: { session: currentSession },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      setSession(currentSession || null);
      setUser(currentSession?.user ?? null);
      authCtxDebug("[AUTHCTX] session resolved", currentSession);
      if (currentSession?.user) {
        authCtxDebug("[AUTHCTX] user resolved", currentSession.user);
      }

      const s1 = await fetchSession();
      authCtxDebug("[AUTHCTX] backend session:", s1?.data);

      if (!currentSession?.user && (!s1.ok || !s1.data || s1.data.authenticated !== true)) {
        authCtxDebug("[AUTHCTX] redirect: no currentSession.user and backend not authenticated");
        clearResolvedAuthState();
        return;
      }

      if (currentSession?.user && (!s1.ok || s1.data?.authenticated !== true)) {
        console.warn("[AUTHCTX] backend session invalid, using supabase session fallback");
        await hydrateClientContext(currentSession.user);
        return;
      }

      if (isPublicAuthPath(path)) {
        const bootstrapUser = currentSession?.user ?? s1?.data?.user ?? null;
        setUser(bootstrapUser);
        setIsAppRoot(
          Boolean(bootstrapUser?.app_metadata?.is_app_root ?? bootstrapUser?.app_metadata?.isAppRoot)
        );
        setCanSwitchOrganizations(extractCanSwitchOrganizations({ user: bootstrapUser }));

        if (s1.ok && s1.data?.authenticated === true) {
          applySessionData(s1.data);
        }
        return;
      }

      if (!s1.ok || !s1.data || s1.data.authenticated !== true) {
        const fallbackUser = currentSession?.user ?? s1?.data?.user ?? null;
        if (!fallbackUser) {
          authCtxDebug("[AUTHCTX] redirect: no fallbackUser after backend session fail");
          clearResolvedAuthState();
          return;
        }
        await hydrateClientContext(fallbackUser);
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
        } else if (currentSession?.user) {
          await hydrateClientContext(currentSession.user);
        }
      }
    } catch (error) {
      console.error("[AUTHCTX] bootstrap failed", error);
      setSession(null);
      setUser(null);
      clearResolvedAuthState();
    } finally {
      setLoading(false);
      authCtxDebug("[AUTHCTX] loading false");
      if (!didBootstrapOnceRef.current) {
        didBootstrapOnceRef.current = true;
        setReady(true);
      }
      setInitialized(true);
    }
  }, [applySessionData, applyEnsureContext, clearResolvedAuthState, hydrateClientContext, path]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      void bootstrap();
    });

    return () => {
      data?.subscription?.unsubscribe?.();
    };
  }, [bootstrap]);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {}

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {}

    try {
      localStorage.removeItem(LS_ORG_KEY);
    } catch {}

    setSession(null);
    setUser(null);
    clearResolvedAuthState();
    setLoading(false);
    setReady(true);
    setInitialized(true);

    authCtxDebug("[AUTHCTX] redirect: logout to /login");
    window.location.href = "/login";
  }, [clearResolvedAuthState]);

  const value = useMemo(() => {
    const resolvedUser = session?.user ?? user ?? null;
    const isAuthenticated = Boolean(resolvedUser?.id);
    const exportedRole = normalizeRole(currentRole) || normalizeRole(resolvedRole) || null;
    const exportedOrgId = currentOrg?.id || resolvedOrgId || null;
    const r = exportedRole;
    const isAdmin = r === "owner" || r === "admin" || isAppRoot;

    return {
      loading,
      ready,
      initialized,
      session,
      isAuthenticated,
      authenticated: isAuthenticated,
      user: resolvedUser,
      isLoggedIn: isAuthenticated,

      currentRole: exportedRole,
      isAppRoot,
      isAdmin,
      canSwitchOrganizations,
      organizations,
      currentOrg,
      switchingOrg,
      selectOrg,

      role: exportedRole,
      activeOrgId: exportedOrgId,
      currentOrgId: exportedOrgId,
      orgId: exportedOrgId,

      refreshSession: bootstrap,
      logout,
    };
  }, [
    session,
    loading,
    ready,
    initialized,
    user,
    currentRole,
    resolvedRole,
    isAppRoot,
    canSwitchOrganizations,
    organizations,
    currentOrg,
    resolvedOrgId,
    switchingOrg,
    selectOrg,
    bootstrap,
    logout,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* =========================
   HOOKS
========================= */

const SAFE_FALLBACK = {
  loading: true,
  ready: false,
  initialized: false,
  session: null,
  isAuthenticated: false,
  authenticated: false,
  user: null,
  isLoggedIn: false,

  currentRole: null,
  isAppRoot: false,
  isAdmin: false,
  canSwitchOrganizations: false,
  organizations: [],
  currentOrg: null,
  switchingOrg: false,
  selectOrg: () => {},

  role: null,
  activeOrgId: null,
  currentOrgId: null,
  orgId: null,

  refreshSession: async () => {},
  logout: async () => {},
};

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    try {
      console.error("[AUTHCTX] useAuth() without provider!", {
        instance: AUTH_CTX_INSTANCE_ID,
        mountedProviderFor:
          typeof window !== "undefined" ? window.__TG_AUTH_PROVIDER_MOUNTED : null,
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