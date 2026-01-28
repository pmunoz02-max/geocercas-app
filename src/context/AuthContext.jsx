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
import { supabase } from "../lib/supabaseClient";

// Mantengo tu key para org activa (usada en varios módulos)
const LS_ORG_KEY = "tg_current_org_id";

const AuthContext = createContext(null);

/**
 * Intenta resolver { org_id, role, is_root } para el usuario autenticado.
 * Estrategia UNIVERSAL:
 *  1) Si existe RPC `get_my_context`, úsala (ideal en multi-tenant).
 *  2) Si no, prueba tablas comunes de membresías (org_memberships, org_users, memberships, user_orgs).
 *  3) Fallback a metadata (app/user_metadata) si hay role ahí.
 */
async function resolveContextFromDB(user, preferredOrgId) {
  if (!user?.id) return { org_id: null, role: null, is_root: false };

  // 1) RPC preferida (si existe)
  try {
    const { data, error } = await supabase.rpc("get_my_context", {
      preferred_org_id: preferredOrgId ?? null,
    });
    if (!error && data) {
      // data puede ser objeto o array(1)
      const row = Array.isArray(data) ? data[0] : data;
      return {
        org_id: row?.org_id ?? row?.orgId ?? null,
        role: row?.role ?? row?.current_role ?? null,
        is_root: !!(row?.is_root ?? row?.isRoot ?? false),
      };
    }
  } catch (_) {
    // Si no existe la función, supabase lanza error => continuamos con fallback
  }

  // Helper para probar una tabla, sin romper si no existe
  const tryTable = async (table, columns) => {
    try {
      // Para escoger la org: primero intentamos preferredOrgId si existe, si no tomamos la primera por created_at
      let q = supabase.from(table).select(columns);

      // Si hay org preferida, filtramos; si no, ordenamos por created_at si existe
      if (preferredOrgId) q = q.eq("org_id", preferredOrgId);

      // Intento de orden estable (si la columna no existe, PostgREST suele ignorar/errorear; lo capturamos)
      try {
        q = q.order("created_at", { ascending: true });
      } catch (_) {}

      const { data, error } = await q.limit(5);
      if (error) return null;
      if (!data || data.length === 0) return null;

      // Si preferredOrgId no estaba y vienen varias, tomamos la primera.
      const row = data[0];
      return {
        org_id: row?.org_id ?? null,
        role: row?.role ?? row?.app_role ?? row?.current_role ?? null,
        is_root: !!(row?.is_root ?? row?.isRoot ?? row?.app_root ?? false),
      };
    } catch (_) {
      // Si la tabla no existe o no hay permisos, devolvemos null
      return null;
    }
  };

  // 2) Tablas comunes (ajusta si tu modelo usa otro nombre; esto es fallback universal)
  const candidates = [
    { table: "org_memberships", cols: "org_id, role, is_root, created_at" },
    { table: "org_users", cols: "org_id, role, is_root, created_at" },
    { table: "memberships", cols: "org_id, role, is_root, created_at" },
    { table: "user_orgs", cols: "org_id, role, is_root, created_at" },
    { table: "profiles", cols: "current_org_id, role, is_root" },
  ];

  for (const c of candidates) {
    const res = await tryTable(c.table, c.cols);
    if (!res) continue;

    // Caso especial profiles: usa current_org_id
    const org_id = res.org_id ?? res.current_org_id ?? null;
    if (org_id) return { org_id, role: res.role ?? null, is_root: !!res.is_root };
  }

  // 3) Fallback final: metadata
  const meta = (user?.user_metadata || user?.app_metadata || {}) ?? {};
  const role =
    meta.currentRole ??
    meta.current_role ??
    meta.role ??
    meta.app_role ??
    null;

  const is_root = !!(meta.is_root ?? meta.isRoot ?? meta.app_root ?? false);

  return { org_id: preferredOrgId ?? null, role, is_root };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(true);

  const [currentOrgId, setCurrentOrgIdState] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);
  const [isAppRoot, setIsAppRoot] = useState(false);

  const bootstrappedRef = useRef(false);

  const setCurrentOrgId = useCallback((orgId) => {
    setCurrentOrgIdState(orgId ?? null);
    if (orgId) localStorage.setItem(LS_ORG_KEY, orgId);
    else localStorage.removeItem(LS_ORG_KEY);
  }, []);

  const refreshContext = useCallback(
    async (u, preferredOrgId) => {
      if (!u?.id) {
        setCurrentOrgId(null);
        setCurrentRole(null);
        setIsAppRoot(false);
        return;
      }

      const preferred =
        preferredOrgId ??
        localStorage.getItem(LS_ORG_KEY) ??
        null;

      const ctx = await resolveContextFromDB(u, preferred);

      // Si no se resolvió org y había preferida guardada, intenta sin preferida (tomar primera)
      let finalCtx = ctx;
      if (!finalCtx.org_id && preferred) {
        finalCtx = await resolveContextFromDB(u, null);
      }

      setCurrentOrgId(finalCtx.org_id ?? null);
      setCurrentRole(finalCtx.role ?? null);
      setIsAppRoot(!!finalCtx.is_root);
    },
    [setCurrentOrgId]
  );

  // Boot inicial: sesión + contexto
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    (async () => {
      setLoading(true);

      const { data } = await supabase.auth.getSession();
      const s = data?.session ?? null;

      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        await refreshContext(s.user);
      }

      setLoading(false);
    })();
  }, [refreshContext]);

  // Listener de cambios de auth
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setLoading(true);

      setSession(newSession ?? null);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        await refreshContext(newSession.user);
      } else {
        setCurrentOrgId(null);
        setCurrentRole(null);
        setIsAppRoot(false);
      }

      setLoading(false);
    });

    return () => sub?.subscription?.unsubscribe?.();
  }, [refreshContext, setCurrentOrgId]);

  const signInWithPassword = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // onAuthStateChange limpiará estados
  }, []);

  const value = useMemo(
    () => ({
      loading,
      session,
      user,

      currentOrgId,
      setCurrentOrgId,

      currentRole,
      isAppRoot,

      signInWithPassword,
      signOut,

      refreshContext,
    }),
    [
      loading,
      session,
      user,
      currentOrgId,
      setCurrentOrgId,
      currentRole,
      isAppRoot,
      signInWithPassword,
      signOut,
      refreshContext,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider />");
  return ctx;
}
