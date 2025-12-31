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
import { createClient } from "@supabase/supabase-js";

/**
 * AuthContext (universal)
 * - Panel + Tracker según hostname
 * - Mantiene session, user, roles, bestRole, currentRole, currentOrg, orgs
 * - authReady: true cuando ya intentó hidratar sesión/permisos (SIEMPRE termina)
 * - authError: mensaje si algo falla (ej: cookies/403/RLS/timeouts)
 *
 * Compatibilidad:
 * - loading = !authReady (para componentes legacy)
 * - role = currentRole (para componentes legacy)
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

function buildTrackerClient() {
  const url =
    import.meta.env.VITE_SUPABASE_TRACKER_URL ||
    import.meta.env.VITE_TRACKER_SUPABASE_URL;

  const anon =
    import.meta.env.VITE_SUPABASE_TRACKER_ANON_KEY ||
    import.meta.env.VITE_TRACKER_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Missing tracker env vars: VITE_SUPABASE_TRACKER_URL/VITE_TRACKER_SUPABASE_URL and VITE_SUPABASE_TRACKER_ANON_KEY/VITE_TRACKER_SUPABASE_ANON_KEY"
    );
  }

  return createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "sb-tugeocercas-auth-token-tracker",
      storage: window.localStorage,
    },
  });
}

export function AuthProvider({ children }) {
  const trackerDomain = useMemo(
    () => isTrackerHostname(window.location.hostname),
    []
  );

  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(null);

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [roles, setRoles] = useState([]);
  const [bestRole, setBestRole] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);

  const [orgs, setOrgs] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);

  // Cliente según dominio
  const client = useMemo(() => {
    if (!trackerDomain) return supabase;
    try {
      return buildTrackerClient();
    } catch (e) {
      console.error("[AuthContext] tracker client error:", e);
      // fallback para no crashear (pero mostramos error)
      return supabase;
    }
  }, [trackerDomain]);

  const resetAuthState = useCallback(() => {
    setSession(null);
    setUser(null);

    setRoles([]);
    setBestRole(null);
    setCurrentRole(null);

    setOrgs([]);
    setCurrentOrg(null);
  }, []);

  // Carga roles (PANEL)
  const loadRoles = useCallback(
    async (userId) => {
      if (!userId) return [];
      // usa client (coherente) y con timeout duro
      const q = client
        .from("app_user_roles")
        .select("org_id, role, created_at")
        .eq("user_id", userId);

      const { data, error } = await withTimeout(q, 12000, "loadRoles");
      if (error) {
        console.warn("[AuthContext] loadRoles error:", error);
        throw error;
      }
      return data || [];
    },
    [client]
  );

  // Carga orgs (PANEL)
  const loadOrgs = useCallback(
    async (_userId) => {
      // OJO: si filtras por org_id en roles después, esta lista puede ser global.
      // Mantengo tu lógica actual pero con timeout.
      const q = client
        .from("organizations")
        .select("id, name, active, plan, owner_id, created_at")
        .eq("active", true)
        .order("created_at", { ascending: false });

      const { data, error } = await withTimeout(q, 12000, "loadOrgs");
      if (error) {
        console.warn("[AuthContext] loadOrgs error:", error);
        throw error;
      }
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

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setAuthReady(false);
      setAuthError(null);

      try {
        // 🔒 Timeout duro: si esto se queda colgado, no bloquea toda la UI
        const sessResp = await withTimeout(
          client.auth.getSession(),
          12000,
          "getSession"
        );

        const sess = sessResp?.data?.session ?? null;
        if (!mounted) return;

        setSession(sess);
        setUser(sess?.user ?? null);

        // No logueado
        if (!sess?.user?.id) {
          resetAuthState();
          return;
        }

        // Tracker domain: no consultamos DB panel
        if (trackerDomain) {
          setRoles([]);
          setBestRole("tracker");
          setCurrentRole("tracker");
          setOrgs([]);
          setCurrentOrg(null);
          return;
        }

        // Panel domain
        const rolesRows = await loadRoles(sess.user.id);
        if (!mounted) return;

        setRoles(rolesRows);

        const best = computeBestRole(rolesRows);
        setBestRole(best);
        setCurrentRole(best);

        const orgRows = await loadOrgs(sess.user.id);
        if (!mounted) return;

        setOrgs(orgRows);
        setCurrentOrg(resolveCurrentOrg(rolesRows, orgRows));
      } catch (e) {
        console.error("[AuthContext] bootstrap error:", e);
        if (!mounted) return;

        const msg =
          e?.message ||
          e?.error_description ||
          (typeof e === "string" ? e : "Unknown auth error");

        setAuthError(msg);

        // Fail-closed pero SIN colgar UI:
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

          const orgRows = await loadOrgs(newSession.user.id);
          if (!mounted) return;

          setOrgs(orgRows);
          setCurrentOrg(resolveCurrentOrg(rolesRows, orgRows));
        } catch (e) {
          console.error("[AuthContext] onAuthStateChange error:", e);
          if (!mounted) return;

          const msg =
            e?.message ||
            e?.error_description ||
            (typeof e === "string" ? e : "Unknown auth error");
          setAuthError(msg);

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
  }, [
    client,
    trackerDomain,
    loadRoles,
    loadOrgs,
    resolveCurrentOrg,
    resetAuthState,
  ]);

  // Debug helpers en window
  useEffect(() => {
    window.__debug_currentOrg = currentOrg ?? null;
    window.__SUPABASE_AUTH_DEBUG = {
      getSession: async () => {
        const { data } = await client.auth.getSession();
        return data?.session ?? null;
      },
      getUser: async () => {
        const { data } = await client.auth.getUser();
        return data?.user ?? null;
      },
      getOrg: () => currentOrg ?? null,
      getRole: () => currentRole ?? bestRole ?? null,
      getReady: () => !!authReady,
      isTrackerDomain: () => !!trackerDomain,
      getError: () => authError ?? null,
    };
  }, [
    authReady,
    authError,
    bestRole,
    client,
    currentOrg,
    currentRole,
    trackerDomain,
  ]);

  const isRootOwner = useMemo(() => bestRole === "owner", [bestRole]);

  // ✅ Compatibilidad legacy
  const loading = !authReady;
  const role = currentRole;

  const value = useMemo(
    () => ({
      // Nuevo canon
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

      // Legacy (para no romper componentes viejos)
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
