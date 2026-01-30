// src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);

function withTimeout(promise, ms, label = "timeout") {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

// ✅ Clave usada para recordar org del tracker (y evitar "orgId: -")
const LAST_ORG_KEY = "app_geocercas_last_org_id";

function readOrgIdFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("org_id");
  } catch {
    return null;
  }
}

function readLastOrgId() {
  try {
    return localStorage.getItem(LAST_ORG_KEY);
  } catch {
    return null;
  }
}

function writeLastOrgId(orgId) {
  try {
    if (orgId) localStorage.setItem(LAST_ORG_KEY, orgId);
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }) {
  // loading = solo “boot” de auth (NUNCA debe colgar)
  const [loading, setLoading] = useState(true);

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  // ctx = { ok, org_id, role, org_name, org_code, user_id } | { ok:false, error:... }
  const [ctx, setCtx] = useState(null);
  const [currentOrg, setCurrentOrg] = useState(null); // { id, name, code? }
  const [role, setRole] = useState(null);

  // ✅ ROOT global (App owner) - fuente de verdad: public.app_root_owners
  const [isAppRoot, setIsAppRoot] = useState(false);

  // (opcional) para mostrar “cargando contexto…”
  const [contextLoading, setContextLoading] = useState(false);

  const mountedRef = useRef(true);

  // ✅ org_id “candidato” (viene del magic link o último conocido)
  const preferredOrgIdRef = useRef(null);

  const setPreferredOrgId = (orgId) => {
    if (!orgId) return;
    preferredOrgIdRef.current = orgId;
    writeLastOrgId(orgId);
    // Set inmediato para que /tracker-gps no quede en orgId: -
    setCurrentOrg((prev) => {
      if (prev?.id === orgId) return prev;
      return { id: orgId, name: prev?.name || null, code: prev?.code || null };
    });
  };

  // ✅ Check root owner (universal). No depende de orgs ni memberships.
  const fetchIsAppRoot = async (u) => {
    if (!mountedRef.current) return false;
    const uid = u?.id;
    if (!uid) {
      if (mountedRef.current) setIsAppRoot(false);
      return false;
    }

    try {
      const { data, error } = await withTimeout(
        supabase
          .from("app_root_owners")
          .select("user_id, active")
          .eq("user_id", uid)
          .maybeSingle(),
        6000,
        "root_check_timeout"
      );

      if (!mountedRef.current) return false;

      if (error) {
        // No bloquear UI por esto
        setIsAppRoot(false);
        return false;
      }

      const ok = !!(data && data.user_id && data.active === true);
      setIsAppRoot(ok);
      return ok;
    } catch {
      if (!mountedRef.current) return false;
      setIsAppRoot(false);
      return false;
    }
  };

  const applyCtx = (data) => {
    setCtx(data);

    if (data?.ok) {
      setRole(data.role || null);

      // ✅ Si el backend devuelve org_id, es la verdad final
      if (data.org_id) setPreferredOrgId(data.org_id);

      setCurrentOrg({
        id: data.org_id,
        name: data.org_name || null,
        code: data.org_code || null,
      });
    } else {
      // ❗ IMPORTANTE: si ya tenemos un org preferido, no lo borres en trackers
      // Solo borra si no existe preferido.
      setRole(null);

      const fallbackOrgId = preferredOrgIdRef.current || readLastOrgId() || readOrgIdFromUrl();
      if (fallbackOrgId) {
        setPreferredOrgId(fallbackOrgId);
        // mantenemos currentOrg para que Tracker GPS pueda operar (gating / RPC)
        return;
      }

      setCurrentOrg(null);
    }
  };

  const fetchContext = async () => {
    if (!mountedRef.current) return;

    // Si no hay sesión, no pedir contexto
    const { data: sessData } = await supabase.auth.getSession();
    const sess = sessData?.session ?? null;
    if (!sess) {
      applyCtx(null);
      return;
    }

    // ✅ Asegura org_id preferido lo antes posible (magic link /tracker-gps?org_id=... / storage)
    const orgIdFromUrl = readOrgIdFromUrl();
    const orgIdFromStorage = readLastOrgId();
    const preferred = orgIdFromUrl || orgIdFromStorage || preferredOrgIdRef.current;
    if (preferred) setPreferredOrgId(preferred);

    setContextLoading(true);
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("get_my_context"),
        8000,
        "rpc_timeout_get_my_context"
      );

      if (!mountedRef.current) return;

      if (error) {
        applyCtx({ ok: false, error: error.message || "rpc_error" });
        return;
      }

      applyCtx(data);
    } catch (e) {
      if (!mountedRef.current) return;
      applyCtx({ ok: false, error: e?.message || "rpc_exception" });
    } finally {
      if (mountedRef.current) setContextLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    // ✅ Captura org_id desde el inicio (antes de que haya sesión incluso)
    const initialOrgId = readOrgIdFromUrl() || readLastOrgId();
    if (initialOrgId) setPreferredOrgId(initialOrgId);

    const boot = async () => {
      setLoading(true);
      try {
        // 1) Boot de sesión (NO esperar contexto)
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          6000,
          "getSession_timeout"
        );

        if (!mountedRef.current) return;

        if (error) {
          // raro, pero no bloquear UI
          setSession(null);
          setUser(null);
          setIsAppRoot(false);
          applyCtx({ ok: false, error: error.message || "getSession_error" });
          return;
        }

        const sess = data?.session ?? null;
        setSession(sess);
        setUser(sess?.user ?? null);

        // ✅ Root check (independiente del contexto/org)
        if (sess?.user) fetchIsAppRoot(sess.user);
        else setIsAppRoot(false);

        // ✅ Si hay sesión y hay org_id en URL/storage, bootstrap inmediato
        if (sess) {
          const orgId = readOrgIdFromUrl() || readLastOrgId() || preferredOrgIdRef.current;
          if (orgId) setPreferredOrgId(orgId);
          fetchContext();
        } else {
          applyCtx(null);
        }
      } catch (e) {
        if (!mountedRef.current) return;
        setSession(null);
        setUser(null);
        setIsAppRoot(false);
        applyCtx({ ok: false, error: e?.message || "boot_exception" });
      } finally {
        // ✅ SIEMPRE liberar loading del boot
        if (mountedRef.current) setLoading(false);
      }
    };

    boot();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mountedRef.current) return;

      setSession(newSession);
      setUser(newSession?.user ?? null);

      // ✅ Root check en cada cambio de auth
      if (newSession?.user) fetchIsAppRoot(newSession.user);
      else setIsAppRoot(false);

      // ✅ Si llega sesión por magic link, fija org_id antes del RPC
      if (newSession) {
        const orgId = readOrgIdFromUrl() || readLastOrgId() || preferredOrgIdRef.current;
        if (orgId) setPreferredOrgId(orgId);
        fetchContext();
      } else {
        applyCtx(null);
      }
    });

    return () => {
      mountedRef.current = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      // Limpieza suave
      setSession(null);
      setUser(null);
      setCtx(null);
      setRole(null);
      setCurrentOrg(null);
      setIsAppRoot(false);
    }
  };

  const value = useMemo(
    () => ({
      loading, // boot auth
      contextLoading, // ctx org
      session,
      user,
      ctx,
      currentOrg,
      role,
      currentRole: role, // ✅ compatibilidad con componentes que usan currentRole
      isAppRoot, // ✅ ROOT global (para /admins y UI)
      refreshContext: fetchContext,
      refreshRoot: () => fetchIsAppRoot(user), // por si quieres refrescar manualmente
      signOut,
      isAuthenticated: !!session,
    }),
    [loading, contextLoading, session, user, ctx, currentOrg, role, isAppRoot]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth debe usarse dentro de <AuthProvider />");
  return v;
}
