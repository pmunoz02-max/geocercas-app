// src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  // ctx = { ok, org_id, role, org_name, org_code, user_id } | { ok:false, error:... }
  const [ctx, setCtx] = useState(null);

  const [currentOrg, setCurrentOrg] = useState(null); // { id, name, code? }
  const [role, setRole] = useState(null);

  const fetchContext = async () => {
    try {
      const { data, error } = await supabase.rpc("get_my_context");
      if (error) {
        setCtx({ ok: false, error: error.message || "rpc_error" });
        setCurrentOrg(null);
        setRole(null);
        return;
      }

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
    } catch (e) {
      setCtx({ ok: false, error: e?.message || "rpc_exception" });
      setCurrentOrg(null);
      setRole(null);
    }
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setLoading(true);
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        const sess = data?.session ?? null;
        setSession(sess);
        setUser(sess?.user ?? null);

        if (sess) {
          await fetchContext();
        } else {
          setCtx(null);
          setCurrentOrg(null);
          setRole(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession) {
        await fetchContext();
      } else {
        setCtx(null);
        setCurrentOrg(null);
        setRole(null);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = useMemo(
    () => ({
      loading,
      session,
      user,
      ctx,
      currentOrg,
      role,
      refreshContext: fetchContext,
      signOut,
      isAuthenticated: !!session,
    }),
    [loading, session, user, ctx, currentOrg, role]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth debe usarse dentro de <AuthProvider />");
  return v;
}
