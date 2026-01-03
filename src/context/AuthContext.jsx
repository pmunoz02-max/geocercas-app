// src/context/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { supabase } from "../supabaseClient.js";

/**
 * AuthContext UNIVERSAL (Panel + Tracker) — Optimizado rendimiento
 *
 * Objetivos:
 * - UI rápida: authReady se pone TRUE apenas hay session (no espera roles/orgs)
 * - Roles/Orgs se cargan en background (no bloquea /inicio)
 * - Orgs: NO se carga "todas las activas"; solo las orgs de los roles del usuario
 * - Si roles/orgs fallan (RLS/red), NO tumba sesión, solo deja "pendiente"
 */

const AuthContext = createContext(null);

function isTrackerHostname(hostname) {
  const h = String(hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

function normalizeRole(r) {
  const s = String(r || "").toLowerCase().trim();
  if (["owner", "admin", "viewer", "tracker"].includes(s)) return s;
  return null;
}

function roleRank(r) {
  if (r === "owner") return 3;
  if (r === "admin") return 2;
  if (r === "viewer") return 1;
  if (r === "tracker") return 0;
  return -1;
}

function computeBestRole(rows) {
  let best = null;
  for (const row of rows || []) {
    const r = normalizeRole(row?.role);
    if (!r) continue;
    if (!best || roleRank(r) > roleRank(best)) best = r;
  }
  return best;
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

// Timeout SOLO para queries REST (no para getSession)
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout en ${label}`)), ms)
    ),
  ]);
}

export function AuthProvider({ children }) {
  const trackerDomain = useMemo(
    () => isTrackerHostname(window.location.hostname),
    []
  );

  const client = supabase;

  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(null);

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [roles, setRoles] = useState([]);
  const [bestRole, setBestRole] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);

  const [orgs, setOrgs] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);

  // Estados de carga “finos” (para UI/diagnóstico)
  const [rolesReady, setRolesReady] = useState(false);
  const [orgsReady, setOrgsReady] = useState(false);

  const resetNonSessionState = useCallback(() => {
    setRoles([]);
    setBestRole(null);
    setCurrentRole(null);
    setOrgs([]);
    setCurrentOrg(null);
    setRolesReady(false);
    setOrgsReady(false);
  }, []);

  const resetAllAuthState = useCallback(() => {
    setSession(null);
    setUser(null);
    resetNonSessionState();
  }, [resetNonSessionState]);

  const applyTrackerDefaults = useCallback(() => {
    setRoles([]);
    setBestRole("tracker");
    setCurrentRole("tracker");
    setOrgs([]);
    setCurrentOrg(null);
    setRolesReady(true);
    setOrgsReady(true);
  }, []);

  const loadRoles = useCallback(
    async (userId) => {
      if (!userId) return [];
      const q = client
        .from("app_user_roles")
        .select("org_id, role, created_at")
        .eq("user_id", userId);

      const { data, error } = await withTimeout(q, 12000, "loadRoles");
      if (error) throw error;
      return data || [];
    },
    [client]
  );

  // ✅ Solo orgs que el usuario realmente usa (por roles)
  const loadOrgsByIds = useCallback(
    async (orgIds) => {
      const ids = uniq(orgIds);
      if (!ids.length) return [];

      const q = client
        .from("organizations")
        .select("id, name, active, plan, owner_id, created_at")
        .in("id", ids)
        .eq("active", true);

      const { data, error } = await withTimeout(q, 12000, "loadOrgsByIds");
      if (error) throw error;
      return data || [];
    },
    [client]
  );

  const resolveCurrentOrg = useCallback((rolesRows, orgRows) => {
    if (!Array.isArray(orgRows) || orgRows.length === 0) return null;

    const best = computeBestRole(rolesRows);
    if (best && Array.isArray(rolesRows) && rolesRows.length) {
      const row = rolesRows
        .map((r) => ({ ...r, role: normalizeRole(r.role) }))
        .filter((r) => r.role === best)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

      if (row?.org_id) {
        const found = orgRows.find((o) => o.id === row.org_id);
        if (found) return found;
      }
    }

    return orgRows[0] || null;
  }, []);

  /**
   * Carga roles + orgs en BACKGROUND.
   * No toca session/user. No bloquea authReady.
   */
  const hydrateNonSessionData = useCallback(
    async (sess) => {
      if (!sess?.user?.id) {
        resetNonSessionState();
        return;
      }

      if (trackerDomain) {
        applyTrackerDefaults();
        return;
      }

      // 1) Roles
      setRolesReady(false);
      let rolesRows = [];
      try {
        rolesRows = await loadRoles(sess.user.id);
        setRoles(rolesRows);

        const best = computeBestRole(rolesRows);
        setBestRole(best);
        setCurrentRole(best);
      } catch (e) {
        console.warn("[AuthContext] roles not ready:", e);
        setRoles([]);
        setBestRole(null);
        setCurrentRole(null);
      } finally {
        setRolesReady(true);
      }

      // 2) Orgs (solo por org_ids de roles)
      setOrgsReady(false);
      try {
        const orgIds = uniq((rolesRows || []).map((r) => r.org_id));
        const orgRows = await loadOrgsByIds(orgIds);

        setOrgs(orgRows);
        setCurrentOrg(resolveCurrentOrg(rolesRows, orgRows));
      } catch (e) {
        console.warn("[AuthContext] orgs not ready:", e);
        setOrgs([]);
        setCurrentOrg(null);
      } finally {
        setOrgsReady(true);
      }
    },
    [
      trackerDomain,
      applyTrackerDefaults,
      loadRoles,
      loadOrgsByIds,
      resolveCurrentOrg,
      resetNonSessionState,
    ]
  );

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setAuthReady(false);
      setAuthError(null);

      try {
        // ✅ Sin timeout: no queremos “auto-logout” por latencias
        const { data, error } = await client.auth.getSession();
        if (error) throw error;

        const sess = data?.session ?? null;

        if (!mounted) return;
        setSession(sess);
        setUser(sess?.user ?? null);

        // ✅ IMPORTANTE: authReady TRUE lo antes posible
        setAuthReady(true);

        if (!sess?.user?.id) {
          resetAllAuthState();
          return;
        }

        // ✅ Roles/orgs en background (no bloquea UI)
        hydrateNonSessionData(sess);
      } catch (e) {
        console.error("[AuthContext] bootstrap error:", e);
        if (!mounted) return;
        setAuthError(e?.message || "Auth bootstrap error");
        resetAllAuthState();
        setAuthReady(true);
      }
    };

    bootstrap();

    const { data: sub } = client.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!mounted) return;

        setAuthError(null);
        setSession(newSession);
        setUser(newSession?.user ?? null);

        // ✅ Auth listo ya (la UI no debe colgarse)
        setAuthReady(true);

        if (!newSession?.user?.id) {
          resetAllAuthState();
          return;
        }

        hydrateNonSessionData(newSession);
      }
    );

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [client, hydrateNonSessionData, resetAllAuthState]);

  // Debug
  useEffect(() => {
    window.__SUPABASE_AUTH_DEBUG = {
      getReady: () => !!authReady,
      getError: () => authError ?? null,
      isTrackerDomain: () => !!trackerDomain,
      getRole: () => currentRole ?? bestRole ?? null,
      getOrg: () => currentOrg ?? null,
      getUser: () => user ?? null,
      getSession: () => session ?? null,
      rolesReady: () => !!rolesReady,
      orgsReady: () => !!orgsReady,
    };
  }, [
    authReady,
    authError,
    trackerDomain,
    currentRole,
    bestRole,
    currentOrg,
    user,
    session,
    rolesReady,
    orgsReady,
  ]);

  const isRootOwner = useMemo(() => bestRole === "owner", [bestRole]);

  // legacy
  const loading = !authReady;
  const role = currentRole;

  const value = useMemo(
    () => ({
      authReady,
      authError,
      session,
      user,
      roles,
      bestRole,
      currentRole,
      isRootOwner,
      orgs,
      currentOrg,
      setCurrentOrg,
      trackerDomain,

      // extras útiles
      rolesReady,
      orgsReady,

      // legacy
      loading,
      role,
    }),
    [
      authReady,
      authError,
      session,
      user,
      roles,
      bestRole,
      currentRole,
      isRootOwner,
      orgs,
      currentOrg,
      trackerDomain,
      rolesReady,
      orgsReady,
      loading,
      role,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
