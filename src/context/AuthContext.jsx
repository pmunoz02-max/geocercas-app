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

  // -----------------------------
  // Single-flight + cache (universal)
  // -----------------------------
  const ctxInFlightRef = useRef(null);
  const ctxLastRef = useRef({ userId: null, at: 0, data: null });

  const rootInFlightRef = useRef(null);
  const rootLastRef = useRef({ userId: null, at: 0, ok: false });

  // TTLs (balance: evita doble-hit pero permite refresh natural)
  const CTX_TTL_MS = 10_000;
  const ROOT_TTL_MS = 60_000;

  // --------------------------------------------------
  // ROOT OWNER CHECK (independiente de org) — single-flight + cache
  // --------------------------------------------------
  const fetchIsAppRoot = async (u, { force = false } = {}) => {
    const uid = u?.id;
    if (!uid || !mountedRef.current) {
      setIsAppRoot(false);
      return false;
    }

    const now = Date.now();
    const last = rootLastRef.current;

    if (!force && last.userId === uid && now - last.at < ROOT_TTL_MS) {
      if (mountedRef.current) setIsAppRoot(!!last.ok);
      return !!last.ok;
    }

    if (!force && rootInFlightRef.current) {
      return rootInFlightRef.current;
    }

    const p = (async () => {
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
        rootLastRef.current = { userId: uid, at: Date.now(), ok };

        if (mountedRef.current) setIsAppRoot(ok);
        return ok;
      } catch {
        rootLastRef.current = { userId: uid, at: Date.now(), ok: false };
        if (mountedRef.current) setIsAppRoot(false);
        return false;
      } finally {
        rootInFlightRef.current = null;
      }
    })();

    rootInFlightRef.current = p;
    return p;
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

  const fetchContext = async ({ force = false } = {}) => {
    if (!mountedRef.current) return null;

    const { data: sessData } = await supabase.auth.getSession();
    const sess = sessData?.session || null;

    if (!sess?.user?.id) {
      ctxLastRef.current = { userId: null, at: Date.now(), data: null };
      applyCtx(null);
      return null;
    }

    const uid = sess.user.id;
    const now = Date.now();
    const last = ctxLastRef.current;

    if (!force && last.userId === uid && now - last.at < CTX_TTL_MS && last.data) {
      applyCtx(last.data);
      return last.data;
    }

    if (!force && ctxInFlightRef.current) {
      return ctxInFlightRef.current;
    }

    setContextLoading(true);

    const p = (async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.rpc("get_my_context"),
          8000,
          "rpc_timeout_get_my_context"
        );

        if (!mountedRef.current) return null;

        if (error) {
          const bad = { ok: false, error: error.message || "rpc_error" };
          ctxLastRef.current = { userId: uid, at: Date.now(), data: bad };
          applyCtx(bad);
          return bad;
        }

        ctxLastRef.current = { userId: uid, at: Date.now(), data };
        applyCtx(data);
        return data;
      } catch (e) {
        if (!mountedRef.current) return null;
        const bad = { ok: false, error: e?.message || "rpc_exception" };
        ctxLastRef.current = { userId: uid, at: Date.now(), data: bad };
        applyCtx(bad);
        return bad;
      } finally {
        if (mountedRef.current) setContextLoading(false);
        ctxInFlightRef.current = null;
      }
    })();

    ctxInFlightRef.current = p;
    return p;
  };

  // --------------------------------------------------
  // CAMBIAR ORG ACTIVA (UNIVERSAL)
  // --------------------------------------------------
  const switchOrg = async (orgId) => {
    if (!orgId) return { ok: false, error: "org_required" };

    const { data, error } = await supabase.rpc("set_current_org", { p_org: orgId });
    if (error) return { ok: false, error: error.message };

    // refrescar contexto (fuente de verdad)
    await fetchContext({ force: true });
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
        const { data } = await withTimeout(supabase.auth.getSession(), 6000, "getSession_timeout");

        if (!mountedRef.current) return;

        const sess = data?.session ?? null;
        setSession(sess);
        setUser(sess?.user ?? null);

        if (sess?.user) {
          // ✅ paralelo, pero single-flight evita doble
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

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mountedRef.current) return;

      // ✅ Clave: evita el "doble-hit" inicial
      if (event === "INITIAL_SESSION") return;

      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        fetchIsAppRoot(newSession.user, { force: true });
        fetchContext({ force: true });
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
      refreshContext: (opts) => fetchContext(opts),
      switchOrg,
      signOut: async () => {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setCtx(null);
        setCurrentOrg(null);
        setRole(null);
        setIsAppRoot(false);
        // limpia cache local
        ctxInFlightRef.current = null;
        rootInFlightRef.current = null;
        ctxLastRef.current = { userId: null, at: Date.now(), data: null };
        rootLastRef.current = { userId: null, at: Date.now(), ok: false };
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
