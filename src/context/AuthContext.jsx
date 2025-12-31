// src/context/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { supabase } from "@/supabaseClient";

/**
 * AuthContext UNIVERSAL (Panel + Tracker)
 *
 * REGLA:
 * - Un solo Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
 * - trackerDomain solo cambia UX/rutas. NO usa otro proyecto/cliente.
 *
 * Garantías:
 * - authReady SIEMPRE termina en true (no cuelga UI)
 * - Nunca hace throw por variables tracker
 *
 * Compatibilidad legacy:
 * - loading = !authReady
 * - role = currentRole
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

  const client = supabase; // ✅ siempre el mismo cliente

  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(null);

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [roles, setRoles] = useState([]);
  const [bestRole, setBestRole] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);

  const [orgs, setOrgs] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);

  const resetAuthState = useCallback(() => {
    setSession(null);
    setUser(null);
    setRoles([]);
    setBestRole(null);
    setCurrentRole(null);
    setOrgs([]);
    setCurrentOrg(null);
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

  const loadOrgs = useCallback(async () => {
    const q = client
      .from("organizations")
      .select("id, name, active, plan, owner_id, created_at")
      .eq("active", true)
      .order("created_at", { ascending: false });

    const { data, error } = await withTimeout(q, 12000, "loadOrgs");
    if (error) throw error;
    return data || [];
  }, [client]);

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

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setAuthReady(false);
      setAuthError(null);

      try {
        const sessResp = await withTimeout(
          client.auth.getSession(),
          12000,
          "getSession"
        );
        const sess = sessResp?.data?.session ?? null;

        if (!mounted) return;
        setSession(sess);
        setUser(sess?.user ?? null);

        if (!sess?.user?.id) {
          resetAuthState();
          return;
        }

        // trackerDomain: no consultamos roles/orgs de panel
        if (trackerDomain) {
          setRoles([]);
          setBestRole("tracker");
          setCurrentRole("tracker");
          setOrgs([]);
          setCurrentOrg(null);
          return;
        }

        const rolesRows = await loadRoles(sess.user.id);
        if (!mounted) return;

        setRoles(rolesRows);
        const best = computeBestRole(rolesRows);
        setBestRole(best);
        setCurrentRole(best);

        const orgRows = await loadOrgs();
        if (!mounted) return;

        setOrgs(orgRows);
        setCurrentOrg(resolveCurrentOrg(rolesRows, orgRows));
      } catch (e) {
        console.error("[AuthContext] bootstrap error:", e);
        if (!mounted) return;
        setAuthError(e?.message || "Auth bootstrap error");
        resetAuthState();
      } finally {
        if (mounted) setAuthReady(true);
      }
    };

    bootstrap();

    const { data: sub } = client.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!mounted) return;

        setAuthReady(false);
        setAuthError(null);

        try {
          setSession(newSession);
          setUser(newSession?.user ?? null);

          if (!newSession?.user?.id) {
            resetAuthState();
            return;
          }

          if (trackerDomain) {
            setRoles([]);
            setBestRole("tracker");
            setCurrentRole("tracker");
            setOrgs([]);
            setCurrentOrg(null);
            return;
          }

          const rolesRows = await loadRoles(newSession.user.id);
          if (!mounted) return;

          setRoles(rolesRows);
          const best = computeBestRole(rolesRows);
          setBestRole(best);
          setCurrentRole(best);

          const orgRows = await loadOrgs();
          if (!mounted) return;

          setOrgs(orgRows);
          setCurrentOrg(resolveCurrentOrg(rolesRows, orgRows));
        } catch (e) {
          console.error("[AuthContext] onAuthStateChange error:", e);
          if (!mounted) return;
          setAuthError(e?.message || "Auth state change error");
          resetAuthState();
        } finally {
          if (mounted) setAuthReady(true);
        }
      }
    );

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [client, trackerDomain, loadRoles, loadOrgs, resolveCurrentOrg, resetAuthState]);

  // Debug
  useEffect(() => {
    window.__SUPABASE_AUTH_DEBUG = {
      getReady: () => !!authReady,
      getError: () => authError ?? null,
      isTrackerDomain: () => !!trackerDomain,
      getRole: () => currentRole ?? bestRole ?? null,
      getOrg: () => currentOrg ?? null,
    };
  }, [authReady, authError, trackerDomain, currentRole, bestRole, currentOrg]);

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
