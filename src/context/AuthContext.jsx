// src/context/AuthContext.jsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "../supabaseClient.js";

/**
 * Root Owner (App-level) — superadmin
 * Solo estos emails pueden ver el módulo /admins (Administrador global).
 * Configurable vía VITE_APP_ROOT_EMAILS="a@b.com,c@d.com"
 */
const APP_ROOT_EMAILS = String(import.meta?.env?.VITE_APP_ROOT_EMAILS || "fenice.ecuador@gmail.com")
  .split(",")
  .map((s) => String(s || "").trim().toLowerCase())
  .filter(Boolean);

function isAppRootEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return !!e && APP_ROOT_EMAILS.includes(e);
}


/**
 * AuthContext UNIVERSAL (Panel + Tracker) — Fuente única de verdad (Backend-first)
 *
 * Principios:
 * - authReady TRUE apenas hay session (UI no se cuelga)
 * - El contexto (org/role/orgs) se hidrata en background desde backend
 * - Fuente primaria: RPC get_my_context()
 * - Fallback universal: ensure_user_org_context() + profiles.current_org_id + memberships + organizations
 * - NUNCA depender de vistas fantasma (ej: app_user_roles)
 *
 * Blindaje anti React #300:
 * - Exponer orgs/currentOrg "safe" para UI: name siempre string (nunca objeto).
 * - Mantener crudo internamente para lógica si hiciera falta.
 */

const AuthContext = createContext(null);

function isTrackerHostname(hostname) {
  const h = String(hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

function normalizeRole(r) {
  const s = String(r || "").toLowerCase().trim();
  if (["owner", "admin", "viewer", "tracker", "member"].includes(s)) return s;
  return null;
}

function roleRank(r) {
  // Ajusta si tu jerarquía cambia
  if (r === "owner") return 4;
  if (r === "admin") return 3;
  if (r === "viewer") return 2;
  if (r === "tracker") return 1;
  if (r === "member") return 0;
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

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout en ${label}`)), ms)
    ),
  ]);
}

/** =========================
 * Blindaje universal de texto (anti #300)
 * ========================= */
function safeText(v, fallback = "") {
  if (v == null) return fallback;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return fallback;
  }
}

export function AuthProvider({ children }) {
  const client = supabase;

  const trackerDomain = useMemo(
    () => isTrackerHostname(window.location.hostname),
    []
  );

  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(null);

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  // Para compatibilidad con pantallas existentes
  const [roles, setRoles] = useState([]); // [{org_id, role}]
  const [bestRole, setBestRole] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);

  // Interno (puede venir "legacy", pero NO debe romper UI)
  const [orgs, setOrgs] = useState([]); // [{id,name,..., role?}]
  const [currentOrg, setCurrentOrg] = useState(null);

  // Estados finos
  const [rolesReady, setRolesReady] = useState(false);
  const [orgsReady, setOrgsReady] = useState(false);

  // Evita bucles por sesión
  const ensuredOnceRef = useRef(false);

  const resetNonSessionState = useCallback(() => {
    setRoles([]);
    setBestRole(null);
    setCurrentRole(null);
    setOrgs([]);
    setCurrentOrg(null);
    setRolesReady(false);
    setOrgsReady(false);
    ensuredOnceRef.current = false;
  }, []);

  const resetAllAuthState = useCallback(() => {
    setSession(null);
    setUser(null);
    resetNonSessionState();
  }, [resetNonSessionState]);

  const applyTrackerDefaults = useCallback(() => {
    // Tracker-only: sin org obligatoria
    setRoles([]);
    setBestRole("tracker");
    setCurrentRole("tracker");
    setOrgs([]);
    setCurrentOrg(null);
    setRolesReady(true);
    setOrgsReady(true);
    ensuredOnceRef.current = true;
  }, []);

  /**
   * Fallback universal: asegurar org y leer current_org_id desde profiles
   */
  const ensureOrgContext = useCallback(
    async (sess) => {
      if (trackerDomain) return null;
      if (!sess?.user?.id) return null;
      if (ensuredOnceRef.current) return null;

      ensuredOnceRef.current = true;

      try {
        const { data, error } = await withTimeout(
          client.rpc("ensure_user_org_context", { p_user_id: sess.user.id }),
          12000,
          "ensure_user_org_context"
        );

        if (error) {
          console.warn("[AuthContext] ensure_user_org_context error:", error);
          return null;
        }
        return data || null; // UUID org_id (según tu implementación)
      } catch (e) {
        console.warn("[AuthContext] ensureOrgContext exception:", e);
        return null;
      }
    },
    [client, trackerDomain]
  );

  /**
   * Leer profiles.current_org_id (fuente real persistida)
   */
  const loadProfileCurrentOrgId = useCallback(
    async (userId) => {
      if (!userId) return null;
      try {
        const { data, error } = await withTimeout(
          client
            .from("profiles")
            .select("current_org_id")
            .eq("id", userId)
            .single(),
          12000,
          "loadProfileCurrentOrgId"
        );
        if (error) throw error;
        return data?.current_org_id ?? null;
      } catch (e) {
        console.warn("[AuthContext] loadProfileCurrentOrgId error:", e);
        return null;
      }
    },
    [client]
  );

  /**
   * Cargar memberships (roles reales) y organizations asociadas (fallback universal)
   */
  const loadMembershipsAndOrgs = useCallback(
    async (userId) => {
      if (!userId) return { memberships: [], orgRows: [] };

      // 1) memberships
      let memberships = [];
      try {
        const { data, error } = await withTimeout(
          client
            .from("memberships")
            .select("org_id, role, is_default, created_at")
            .eq("user_id", userId),
          12000,
          "loadMemberships"
        );
        if (error) throw error;
        memberships = data || [];
      } catch (e) {
        console.warn("[AuthContext] loadMemberships error:", e);
        memberships = [];
      }

      // 2) organizations por ids
      const orgIds = uniq(memberships.map((m) => m.org_id));
      if (!orgIds.length) return { memberships, orgRows: [] };

      let orgRows = [];
      try {
        const { data, error } = await withTimeout(
          client
            .from("organizations")
            .select("id, name, active, plan, owner_id, created_at")
            .in("id", orgIds),
          12000,
          "loadOrganizationsByMemberships"
        );
        if (error) throw error;
        orgRows = data || [];
      } catch (e) {
        console.warn("[AuthContext] loadOrganizations error:", e);
        orgRows = [];
      }

      // 3) fusionar rol en orgRows (útil para UI)
      const roleByOrg = new Map();
      for (const m of memberships) {
        const r = normalizeRole(m?.role) || "member";
        roleByOrg.set(m.org_id, r);
      }
      orgRows = (orgRows || []).map((o) => ({
        ...o,
        role: roleByOrg.get(o.id) || "member",
      }));

      return { memberships, orgRows };
    },
    [client]
  );

  /**
   * Intentar RPC get_my_context() (fuente limpia definitiva)
   */
  const tryGetMyContextRpc = useCallback(async () => {
    try {
      const { data, error } = await withTimeout(
        client.rpc("get_my_context"),
        12000,
        "get_my_context"
      );
      if (error) {
        // Si el RPC no existe o falla por permisos, caemos a fallback
        console.warn("[AuthContext] get_my_context error:", error);
        return null;
      }
      if (!data || data.ok === false) return null;
      return data;
    } catch (e) {
      console.warn("[AuthContext] get_my_context exception:", e);
      return null;
    }
  }, [client]);

  /**
   * Resolver currentOrg de forma robusta:
   * - si tenemos current_org_id => elegir esa
   * - si no => org donde el bestRole sea mejor
   * - si no => primera org disponible
   */
  const resolveCurrentOrg = useCallback((orgRows, currentOrgId, roleRows) => {
    const rows = Array.isArray(orgRows) ? orgRows : [];
    if (!rows.length) return null;

    if (currentOrgId) {
      const found = rows.find((o) => o.id === currentOrgId);
      if (found) return found;
    }

    const best = computeBestRole(roleRows);
    if (best && roleRows?.length) {
      const candidateOrgId = roleRows
        .filter((r) => normalizeRole(r.role) === best)
        .map((r) => r.org_id)[0];
      if (candidateOrgId) {
        const found = rows.find((o) => o.id === candidateOrgId);
        if (found) return found;
      }
    }

    return rows[0] || null;
  }, []);

  /**
   * Hidratación principal del contexto (background)
   * - Tracker: defaults
   * - Panel: get_my_context() => OK
   * - Si falla: ensure_user_org_context() + profiles + memberships + orgs
   */
  const hydrateContext = useCallback(
    async (sess) => {
      if (!sess?.user?.id) {
        resetNonSessionState();
        return;
      }

      if (trackerDomain) {
        applyTrackerDefaults();
        return;
      }

      setRolesReady(false);
      setOrgsReady(false);

      const userId = sess.user.id;

      // 1) Intentar RPC definitivo
      const rpcCtx = await tryGetMyContextRpc();
      if (rpcCtx?.ok) {
        const currentOrgId = rpcCtx.current_org_id || null;

        // roles compatibles (por org)
        const rpcOrgs = Array.isArray(rpcCtx.orgs) ? rpcCtx.orgs : [];
        const roleRows = rpcOrgs.map((o) => ({
          org_id: o.org_id,
          role: normalizeRole(o.role) || "member",
        }));

        // orgs para UI (interno)
        const orgRows = rpcOrgs.map((o) => ({
          id: o.org_id,
          name: o.name || "(sin nombre)",
          active: true,
          plan: o.plan ?? null,
          owner_id: o.owner_id ?? null,
          created_at: o.created_at ?? null,
          role: normalizeRole(o.role) || "member",
          is_default: !!o.is_default,
        }));

        setRoles(roleRows);
        const best =
          normalizeRole(rpcCtx.role) || computeBestRole(roleRows) || "member";
        setBestRole(best);
        setCurrentRole(best);

        setOrgs(orgRows);
        setCurrentOrg(resolveCurrentOrg(orgRows, currentOrgId, roleRows));

        setRolesReady(true);
        setOrgsReady(true);
        return;
      }

      // 2) Fallback universal (sin depender de vistas)
      //    2.1 asegurar contexto (crea org si falta)
      const ensuredOrgId = await ensureOrgContext(sess);

      //    2.2 leer profiles.current_org_id (fuente primaria persistida)
      const profileOrgId = await loadProfileCurrentOrgId(userId);

      //    2.3 memberships + orgs
      const { memberships, orgRows } = await loadMembershipsAndOrgs(userId);

      // roles compatibles
      const roleRows = (memberships || []).map((m) => ({
        org_id: m.org_id,
        role: normalizeRole(m.role) || "member",
      }));

      // Best role
      const best = computeBestRole(roleRows) || "member";

      setRoles(roleRows);
      setBestRole(best);
      setCurrentRole(best);

      setOrgs(orgRows || []);

      // Resolver org actual: prioridad profiles.current_org_id, luego ensured, luego lo que haya
      const chosenOrgId = profileOrgId || ensuredOrgId || null;
      setCurrentOrg(resolveCurrentOrg(orgRows, chosenOrgId, roleRows));

      setRolesReady(true);
      setOrgsReady(true);
    },
    [
      trackerDomain,
      applyTrackerDefaults,
      resetNonSessionState,
      tryGetMyContextRpc,
      ensureOrgContext,
      loadProfileCurrentOrgId,
      loadMembershipsAndOrgs,
      resolveCurrentOrg,
    ]
  );

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setAuthReady(false);
      setAuthError(null);

      try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;

        const sess = data?.session ?? null;

        if (!mounted) return;

        setSession(sess);
        setUser(sess?.user ?? null);

        // UI rápida
        setAuthReady(true);

        if (!sess?.user?.id) {
          resetAllAuthState();
          return;
        }

        // Contexto en background
        hydrateContext(sess);
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

        // UI rápida
        setAuthReady(true);

        if (!newSession?.user?.id) {
          resetAllAuthState();
          return;
        }

        hydrateContext(newSession);
      }
    );

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [client, hydrateContext, resetAllAuthState]);

  /** =========================
   * Derivados SAFE para UI (anti React #300)
   * - name SIEMPRE string
   * ========================= */
  const orgsSafe = useMemo(() => {
    const arr = Array.isArray(orgs) ? orgs : [];
    return arr.map((o) => ({
      ...o,
      // blindaje: si name viene objeto/legacy => string seguro
      name: safeText(o?.name, "Organización"),
    }));
  }, [orgs]);

  const currentOrgSafe = useMemo(() => {
    if (!currentOrg) return null;
    return {
      ...currentOrg,
      name: safeText(currentOrg?.name, "Organización"),
    };
  }, [currentOrg]);

  /** =========================
   * Compatibilidad legacy (para pantallas existentes)
   * ========================= */
  const isAdmin = useMemo(() => {
    const r = String(bestRole || currentRole || "").toLowerCase();
    return r === "owner" || r === "admin";
  }, [bestRole, currentRole]);

  const persistCurrentOrgId = useCallback(
    async (orgId) => {
      // Tracker no persiste org
      if (trackerDomain) return;
      const userId = session?.user?.id;
      if (!userId) return;

      try {
        const { error } = await withTimeout(
          client.from("profiles").update({ current_org_id: orgId }).eq("id", userId),
          12000,
          "persistCurrentOrgId"
        );
        if (error) throw error;
      } catch (e) {
        console.warn("[AuthContext] persistCurrentOrgId error:", e);
      }
    },
    [client, session, trackerDomain]
  );

  const selectOrg = useCallback(
    async (orgId) => {
      const id = orgId || null;

      // Actualiza estado local con el objeto de orgs (crudo, pero luego se expone SAFE)
      const found = (Array.isArray(orgs) ? orgs : []).find((o) => o?.id === id) || null;
      setCurrentOrg(found);

      // Persistir a profiles (fuente primaria)
      if (id) await persistCurrentOrgId(id);
    },
    [orgs, persistCurrentOrgId]
  );

  // Debug útil en consola
  useEffect(() => {
    window.__SUPABASE_AUTH_DEBUG = {
      getReady: () => !!authReady,
      getError: () => authError ?? null,
      isTrackerDomain: () => !!trackerDomain,
      getRole: () => currentRole ?? bestRole ?? null,
      getOrg: () => currentOrgSafe ?? null,
      getUser: () => user ?? null,
      getSession: () => session ?? null,
      rolesReady: () => !!rolesReady,
      orgsReady: () => !!orgsReady,
      ensuredOnce: () => !!ensuredOnceRef.current,
      getOrgs: () => orgsSafe ?? [],
    };
  }, [
    authReady,
    authError,
    trackerDomain,
    currentRole,
    bestRole,
    currentOrgSafe,
    user,
    session,
    rolesReady,
    orgsReady,
    orgsSafe,
  ]);

  const isRootOwner = useMemo(() => bestRole === "owner", [bestRole]);
  const isAppRoot = useMemo(() => isAppRootEmail(user?.email), [user?.email]);

  // legacy
  const loading = !authReady;
  const role = currentRole;

  const value = useMemo(
    () => ({
      authReady,
      authError,
      session,
      user,

      // roles
      roles,
      bestRole,
      currentRole,
      isRootOwner,
      isAppRoot,

      // orgs (SAFE para UI)
      orgs: orgsSafe,
      currentOrg: currentOrgSafe,
      setCurrentOrg, // interno (evitar usar en UI si no hace falta)

      // domain
      trackerDomain,

      // extras
      rolesReady,
      orgsReady,

      // legacy aliases (para componentes viejos)
      loading,
      role,
      isAdmin,
      organizations: orgsSafe,
      selectOrg,
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
      isAppRoot,
      orgsSafe,
      currentOrgSafe,
      trackerDomain,
      rolesReady,
      orgsReady,
      loading,
      role,
      isAdmin,
      selectOrg,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}