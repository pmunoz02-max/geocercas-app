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

const AuthContext = createContext(null);

// Mantengo tu key para org activa (usada en varios módulos)
const LS_ORG_KEY = "tg_current_org_id";

const PUBLIC_ROUTES = ["/login", "/reset-password", "/forgot-password", "/auth/callback"];

function isPublicRoutePath(pathname) {
  const p = (pathname || "").toLowerCase();
  return PUBLIC_ROUTES.some((r) => p === r || p.startsWith(r + "/"));
}

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  // Mantengo estos campos por compatibilidad; por ahora salen desde metadata si existe
  const [currentRole, setCurrentRole] = useState(null);
  const [isAppRoot, setIsAppRoot] = useState(false);

  // Org: mantenemos selección local (hasta que el módulo de orgs se alimente 100% desde DB)
  const [currentOrgId, setCurrentOrgId] = useState(null);

  const didBootstrapOnceRef = useRef(false);

  const resolveRoleAndRoot = useCallback((u) => {
    // Soporta varios lugares donde puede vivir la info
    const meta = (u?.user_metadata || u?.app_metadata || {}) ?? {};
    const role =
      meta.currentRole ??
      meta.current_role ??
      meta.role ??
      meta.app_role ??
      null;

    const isRoot = Boolean(meta.is_app_root ?? meta.isAppRoot ?? false);

    setCurrentRole(role ? String(role).toLowerCase() : null);
    setIsAppRoot(isRoot);
  }, []);

  const loadOrgFromStorage = useCallback(() => {
    try {
      const v = localStorage.getItem(LS_ORG_KEY);
      setCurrentOrgId(v || null);
    } catch {
      setCurrentOrgId(null);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    // En rutas públicas igual dejamos que Supabase hidrate sesión si existe.
    // Solo evitamos lógica de “forzar auth” aquí (la protección real debe estar en el router/layout).
    setLoading(true);

    try {
      const { data } = await supabase.auth.getSession();
      const nextSession = data?.session ?? null;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      resolveRoleAndRoot(nextSession?.user ?? null);

      loadOrgFromStorage();
    } finally {
      setLoading(false);
      if (!didBootstrapOnceRef.current) {
        didBootstrapOnceRef.current = true;
        setReady(true);
      }
    }
  }, [loadOrgFromStorage, resolveRoleAndRoot]);

  useEffect(() => {
    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      resolveRoleAndRoot(nextSession?.user ?? null);

      // Si el usuario cambió, re-cargamos org seleccionada (por si se limpia en logout)
      loadOrgFromStorage();
    });

    return () => {
      try {
        sub?.subscription?.unsubscribe();
      } catch {}
    };
  }, [bootstrap, loadOrgFromStorage, resolveRoleAndRoot]);

  const setOrg = useCallback((orgId) => {
    const v = orgId ? String(orgId) : "";
    setCurrentOrgId(v || null);
    try {
      if (v) localStorage.setItem(LS_ORG_KEY, v);
      else localStorage.removeItem(LS_ORG_KEY);
    } catch {}
  }, []);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {}

    try {
      localStorage.removeItem(LS_ORG_KEY);
    } catch {}

    setSession(null);
    setUser(null);
    setCurrentRole(null);
    setIsAppRoot(false);
    setCurrentOrgId(null);

    // Mantengo el redirect directo como tu patrón actual
    window.location.href = "/login";
  }, []);

  const authenticated = Boolean(user);

  const value = useMemo(
    () => ({
      // core flags
      loading,
      ready,
      authenticated,
      isLoggedIn: authenticated,

      // supabase session
      session,
      user,

      // roles (compat)
      currentRole,
      isAppRoot,
      role: currentRole,

      // org (compat)
      currentOrg: currentOrgId ? { id: currentOrgId } : null,
      currentOrgId: currentOrgId || null,
      orgId: currentOrgId || null,
      setCurrentOrgId: setOrg,

      // actions
      refreshSession: bootstrap,
      logout,

      // helper (a veces útil en guards)
      isPublicRoutePath,
    }),
    [
      loading,
      ready,
      authenticated,
      session,
      user,
      currentRole,
      isAppRoot,
      currentOrgId,
      setOrg,
      bootstrap,
      logout,
    ]
  );

  // Si estás en ruta pública, NO bloqueamos render.
  // La protección real debe ser un AuthGuard en rutas privadas.
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
