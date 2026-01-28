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
  // loading = solo “boot” de auth (NUNCA debe colgar)
  const [loading, setLoading] = useState(true);

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  // ctx = { ok, org_id, role, org_name, org_code, user_id } | { ok:false, error:... }
  const [ctx, setCtx] = useState(null);
  const [currentOrg, setCurrentOrg] = useState(null); // { id, name, code? }
  const [role, setRole] = useState(null);

  // (opcional) para mostrar “cargando contexto…”
  const [contextLoading, setContextLoading] = useState(false);

  const mountedRef = useRef(true);

  const applyCtx = (data) => {
    setCtx(data);

    if (data?.ok) {
      setRole(data.role || null);
      setCurrentOrg({
        id: data.org_id,
        name: data.org_name || null,
        code: data.org_code || null,
      });
    } else {
      setRole(null);
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
          applyCtx({ ok: false, error: error.message || "getSession_error" });
          return;
        }

        const sess = data?.session ?? null;
        setSession(sess);
        setUser(sess?.user ?? null);

        // 2) Cargar contexto sin bloquear el boot
        if (sess) fetchContext();
        else applyCtx(null);
      } catch (e) {
        if (!mountedRef.current) return;
        setSession(null);
        setUser(null);
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

      // ✅ No bloquear UI esperando RPC
      if (newSession) fetchContext();
      else applyCtx(null);
    });

    return () => {
      mountedRef.current = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
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
      refreshContext: fetchContext,
      signOut,
      isAuthenticated: !!session,
    }),
    [loading, contextLoading, session, user, ctx, currentOrg, role]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth debe usarse dentro de <AuthProvider />");
  return v;
}
