import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabaseClient";
import { supabaseTracker } from "@/supabaseTrackerClient";

/**
 * AuthContext (universal)
 * - Soporta panel y tracker (según hostname)
 * - Mantiene user, session, roles, currentOrg, orgs
 * - Expone authReady para bloquear acciones hasta hidratar sesión
 * - Expone debug seguro en window:
 *    window.__SUPABASE_AUTH_DEBUG.getSession()
 *    window.__SUPABASE_AUTH_DEBUG.getUser()
 *    window.__SUPABASE_AUTH_DEBUG.getOrg()
 *    window.__SUPABASE_AUTH_DEBUG.getRole()
 *    window.__debug_currentOrg
 */

const AuthContext = createContext(null);

function isTrackerHostname(hostname) {
  const h = String(hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

export function AuthProvider({ children }) {
  const trackerDomain = useMemo(() => isTrackerHostname(window.location.hostname), []);
  const client = useMemo(() => (trackerDomain ? supabaseTracker : supabase), [trackerDomain]);

  const [authReady, setAuthReady] = useState(false);

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [roles, setRoles] = useState([]); // app_user_roles rows
  const [bestRole, setBestRole] = useState(null); // "owner"|"admin"|"viewer"|"tracker"|null

  const [orgs, setOrgs] = useState([]); // organizations disponibles para el user (panel)
  const [currentOrg, setCurrentOrg] = useState(null);

  // ===========================================================
  // Helpers de rol
  // ===========================================================
  const normalizeRole = (r) => {
    const s = String(r || "").toLowerCase().trim();
    if (["owner", "admin", "viewer", "tracker"].includes(s)) return s;
    return null;
  };

  const roleRank = (r) => {
    if (r === "owner") return 3;
    if (r === "admin") return 2;
    if (r === "viewer") return 1;
    if (r === "tracker") return 0;
    return -1;
  };

  const computeBestRole = (rows) => {
    let best = null;
    for (const row of rows || []) {
      const r = normalizeRole(row?.role);
      if (!r) continue;
      if (!best || roleRank(r) > roleRank(best)) best = r;
    }
    return best;
  };

  // ===========================================================
  // Carga roles (siempre desde supabase del panel)
  // ===========================================================
  const loadRoles = async (userId) => {
    if (!userId) return [];

    // roles viven en el proyecto principal (panel)
    const { data, error } = await supabase
      .from("app_user_roles")
      .select("org_id, role, created_at")
      .eq("user_id", userId);

    if (error) {
      console.warn("[AuthContext] loadRoles error:", error);
      return [];
    }
    return data || [];
  };

  // ===========================================================
  // Carga organizaciones visibles (panel)
  // ===========================================================
  const loadOrgs = async (userId) => {
    if (!userId) return [];

    // Si tienes una vista/función propia, ajústala aquí.
    // Este enfoque es universal si tu RLS permite ver orgs por app_user_roles.
    const { data, error } = await supabase
      .from("organizations")
      .select("id, name, active, plan, owner_id, created_at")
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[AuthContext] loadOrgs error:", error);
      return [];
    }

    return data || [];
  };

  // ===========================================================
  // Resolver org actual: preferencia por la del rol más alto
  // ===========================================================
  const resolveCurrentOrg = (rolesRows, orgRows) => {
    if (!Array.isArray(orgRows) || orgRows.length === 0) return null;

    // preferir la org del rol "best"
    const best = computeBestRole(rolesRows);
    if (best && Array.isArray(rolesRows)) {
      // buscar org_id asociado al rol "best"
      const row = rolesRows
        .map((r) => ({ ...r, role: normalizeRole(r.role) }))
        .filter((r) => r.role === best)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

      if (row?.org_id) {
        const found = orgRows.find((o) => o.id === row.org_id);
        if (found) return found;
      }
    }

    // fallback: primera org
    return orgRows[0] || null;
  };

  // ===========================================================
  // Bootstrap principal
  // ===========================================================
  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        setAuthReady(false);

        // 1) sesión inicial
        const { data: sessData } = await client.auth.getSession();
        const sess = sessData?.session ?? null;

        if (!mounted) return;

        setSession(sess);
        setUser(sess?.user ?? null);

        if (!sess?.user?.id) {
          // No logueado
          setRoles([]);
          setBestRole(null);
          setOrgs([]);
          setCurrentOrg(null);
          return;
        }

        // 2) roles (siempre panel)
        const rolesRows = await loadRoles(sess.user.id);
        if (!mounted) return;
        setRoles(rolesRows);
        const best = computeBestRole(rolesRows);
        setBestRole(best);

        // 3) orgs solo para panel
        if (!trackerDomain) {
          const orgRows = await loadOrgs(sess.user.id);
          if (!mounted) return;
          setOrgs(orgRows);

          const resolved = resolveCurrentOrg(rolesRows, orgRows);
          setCurrentOrg(resolved);
        } else {
          // tracker domain: no necesita org selector
          setOrgs([]);
          setCurrentOrg(null);
        }
      } finally {
        if (mounted) setAuthReady(true);
      }
    };

    bootstrap();

    // 4) listener de auth state
    const { data: sub } = client.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;

      setAuthReady(false);
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (!newSession?.user?.id) {
        setRoles([]);
        setBestRole(null);
        setOrgs([]);
        setCurrentOrg(null);
        setAuthReady(true);
        return;
      }

      // recargar roles/orgs en cualquier cambio de sesión
      const rolesRows = await loadRoles(newSession.user.id);
      if (!mounted) return;
      setRoles(rolesRows);
      const best = computeBestRole(rolesRows);
      setBestRole(best);

      if (!trackerDomain) {
        const orgRows = await loadOrgs(newSession.user.id);
        if (!mounted) return;
        setOrgs(orgRows);
        setCurrentOrg(resolveCurrentOrg(rolesRows, orgRows));
      } else {
        setOrgs([]);
        setCurrentOrg(null);
      }

      setAuthReady(true);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [client, trackerDomain]);

  // ===========================================================
  // Exponer debug y currentOrg en window (universal)
  // ===========================================================
  useEffect(() => {
    // debug_currentOrg (ya lo estabas intentando)
    window.__debug_currentOrg = currentOrg ?? null;

    // Debug API segura: solo lectura de estado local del cliente
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
      getRole: () => bestRole ?? null,
      getReady: () => !!authReady,
      isTrackerDomain: () => !!trackerDomain,
    };
  }, [authReady, bestRole, client, currentOrg, trackerDomain]);

  const isRootOwner = useMemo(() => bestRole === "owner", [bestRole]);

  const value = useMemo(
    () => ({
      authReady,
      session,
      user,
      roles,
      bestRole,
      isRootOwner,
      orgs,
      currentOrg,
      setCurrentOrg, // para selector de org (panel)
      trackerDomain,
    }),
    [authReady, session, user, roles, bestRole, isRootOwner, orgs, currentOrg, trackerDomain]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
