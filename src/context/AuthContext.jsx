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
 * REGLAS:
 * - Un solo Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
 * - trackerDomain solo cambia UX/rutas. NO usa otro proyecto/cliente.
 *
 * GARANTÍAS:
 * - Nunca hace throw por variables tracker
 * - authReady SIEMPRE termina en true (no cuelga UI)
 * - NO “mata” la sesión por timeouts de roles/orgs
 *
 * COMPATIBILIDAD legacy:
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

// Timeout SOLO para queries (roles/orgs). NUNCA para getSession (no destructivo).
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

  const resetNonSessionState = useCallback(() => {
    // ⚠️ OJO: no tocamos session/user aquí
    setRoles([]);
    setBestRole(null);
    setCurrentRole(null);
    setOrgs([]);
    setCurrentOrg(null);
  }, []);

  const resetAllAuthState = useCallback(() => {
    setSession(null);
    setUser(null);
    resetNonSessionState();
  }, [resetNonSessionState]);

  const loadRoles = useCallback(
    async (userId) => {
      if (!userId) return [];

      // ⚠️ Importante: si por RLS aún no hay fila/permiso, puede fallar.
      // NO debe tumbar la sesión.
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

  const applyTrackerDefaults = useCallback(() => {
    setRoles([]);
    setBestRole("tracker");
    setCurrentRole("tracker");
    setOrgs([]);
    setCurrentOrg(null);
  }, []);

  const hydrateNonSessionData = useCallback(
    async (sess) => {
      // Esta función NO debe romper la sesión si roles/orgs fallan.
      if (!sess?.user?.id) {
        resetNonSessionState();
        return;
      }

      if (trackerDomain) {
        applyTrackerDefaults();
        return;
      }

      // 1) Roles (no destructivo)
      let rolesRows = [];
      try {
        rolesRows = await loadRoles(sess.user.id);
        setRoles(rolesRows);

        const best = computeBestRole(rolesRows);
        setBestRole(best);
        setCurrentRole(best);
      } catch (e) {
        console.warn("[AuthContext] roles not ready:", e);
        // Mantener sesión, pero sin roles aún
        setRoles([]);
        setBestRole(null);
        setCurrentRole(null);
      }

      // 2) Orgs (no destructivo)
      try {
        const orgRows = await loadOrgs();
        setOrgs(orgRows);
        setCurrentOrg(resolveCurrentOrg(rolesRows, orgRows));
      } catch (e) {
        console.warn("[AuthContext] orgs not ready:", e);
        setOrgs([]);
        setCurrentOrg(null);
      }
    },
    [
      trackerDomain,
      applyTrackerDefaults,
      loadRoles,
      loadOrgs,
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
        // ✅ SIN timeout: getSession puede tardar (storage/cookies). No debe tumbar la UI.
        const { data, error } = await client.auth.getSession();
        if (error) throw error;

        const sess = data?.session ?? null;

        if (!mounted) return;
        setSession(sess);
        setUser(sess?.user ?? null);

        if (!sess?.user?.id) {
          resetAllAuthState();
          return;
        }

        // Cargar roles/orgs (no destructivo)
        await hydrateNonSessionData(sess);
      } catch (e) {
        console.error("[AuthContext] bootstrap error:", e);
        if (!mounted) return;

        // Si falla bootstrap (por red, etc.), NO inventamos sesión.
        // Dejamos error visible y estado limpio.
        setAuthError(e?.message || "Auth bootstrap error");
        resetAllAuthState();
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
            resetAllAuthState();
            return;
          }

          await hydrateNonSessionData(newSession);
        } catch (e) {
          console.error("[AuthContext] onAuthStateChange error:", e);
          if (!mounted) return;

          // ⚠️ No matamos sesión por fallos de roles/orgs aquí.
          // Solo registramos el error y dejamos sesión viva.
          setAuthError(e?.message || "Auth state change error");

          // Mantener session/user, limpiar solo roles/orgs para evitar loops de guard
          resetNonSessionState();
        } finally {
          if (mounted) setAuthReady(true);
        }
      }
    );

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [client, hydrateNonSessionData, resetAllAuthState, resetNonSessionState]);

  // Debug útil en consola: window.__SUPABASE_AUTH_DEBUG.getReady()
  useEffect(() => {
    window.__SUPABASE_AUTH_DEBUG = {
      getReady: () => !!authReady,
      getError: () => authError ?? null,
      isTrackerDomain: () => !!trackerDomain,
      getRole: () => currentRole ?? bestRole ?? null,
      getOrg: () => currentOrg ?? null,
      getUser: () => user ?? null,
      getSession: () => session ?? null,
    };
  }, [authReady, authError, trackerDomain, currentRole, bestRole, currentOrg, user, session]);

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
