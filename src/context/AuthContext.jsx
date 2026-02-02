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

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [contextLoading, setContextLoading] = useState(false);

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [ctx, setCtx] = useState(null);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [role, setRole] = useState(null);

  const [isAppRoot, setIsAppRoot] = useState(false);

  const mountedRef = useRef(true);

  // --------------------------------------------------
  // ROOT OWNER CHECK (independiente de org)
  // --------------------------------------------------
  const fetchIsAppRoot = async (u) => {
    const uid = u?.id;
    if (!uid || !mountedRef.current) {
      setIsAppRoot(false);
      return false;
    }

    try {
      const { data } = await withTimeout(
        supabase
          .from("app_root_owners")
          .select("user_id, active")
          .eq("user_id", uid)
          .maybeSingle(),
        6000,
        "root_check_timeout"
      );

      const ok = !!(data && data.user_id && data.active === true);
      if (mountedRef.current) setIsAppRoot(ok);
      return ok;
    } catch {
      if (mountedRef.current) setIsAppRoot(false);
      return false;
    }
  };

  // --------------------------------------------------
  // CONTEXT (ORG + ROLE) — FUENTE DE VERDAD = BACKEND
  // --------------------------------------------------
  const applyCtx = (data) => {
    setCtx(data || null);

    if (data?.ok && data.org_id) {
      setCurrentOrg({
        id: data.org_id,
        name: data.org_name || null,
      });
      setRole(data.role || null);
    } else {
      setCurrentOrg(null);
      setRole(null);
    }
  };

  const fetchContext = async () => {
    if (!mountedRef.current) return;

    const { data: sessData } = await supabase.auth.getSession();
    if (!sessData?.session) {
      applyCtx(null);
      return;
    }

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

  // --------------------------------------------------
  // CAMBIAR ORG ACTIVA (UNIVERSAL)
  // --------------------------------------------------
  const switchOrg = async (orgId) => {
    if (!orgId) return { ok: false, error: "org_required" };

    const { data, error } = await supabase.rpc("set_current_org", { p_org: orgId });
    if (error) {
      return { ok: false, error: error.message };
    }

    // volver a pedir contexto (fuente de verdad)
    await fetchContext();
    return data;
  };

  // --------------------------------------------------
  // BOOTSTRAP
  // --------------------------------------------------
  useEffect(() => {
    mountedRef.current = true;

    const boot = async () => {
      setLoading(true);
      try {
        const { data } = await withTimeout(
          supabase.auth.getSession(),
          6000,
          "getSession_timeout"
        );

        if (!mountedRef.current) return;

        const sess = data?.session ?? null;
        setSession(sess);
        setUser(sess?.user ?? null);

        if (sess?.user) {
          fetchIsAppRoot(sess.user);
          fetchContext();
        } else {
          applyCtx(null);
          setIsAppRoot(false);
        }
      } catch {
        if (!mountedRef.current) return;
        setSession(null);
        setUser(null);
        setIsAppRoot(false);
        applyCtx(null);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    boot();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mountedRef.current) return;

      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        fetchIsAppRoot(newSession.user);
        fetchContext();
      } else {
        setIsAppRoot(false);
        applyCtx(null);
      }
    });

    return () => {
      mountedRef.current = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // --------------------------------------------------
  // API CONTEXT
  // --------------------------------------------------
  const value = useMemo(
    () => ({
      loading,
      contextLoading,
      session,
      user,
      ctx,
      currentOrg,
      role,
      currentRole: role,
      isAppRoot,
      refreshContext: fetchContext,
      switchOrg, // ✅ ÚNICA forma de cambiar org
      signOut: async () => {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setCtx(null);
        setCurrentOrg(null);
        setRole(null);
        setIsAppRoot(false);
      },
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
