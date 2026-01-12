import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext(null);

const safeText = (v) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

export function AuthProvider({ children }) {
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [user, setUser] = useState(null);

  const [currentOrg, setCurrentOrg] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);

  const [isAppRoot, setIsAppRoot] = useState(false);
  const [loadingRoot, setLoadingRoot] = useState(true);

  async function loadIsAppRoot(uid) {
    setLoadingRoot(true);
    try {
      const cacheKey = `is_app_root_v1:${uid}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const ageMs = Date.now() - (parsed?.ts || 0);
        if (typeof parsed?.val === "boolean" && ageMs < 15 * 60 * 1000) {
          setIsAppRoot(parsed.val);
          setLoadingRoot(false);
          return;
        }
      }

      const { data, error } = await supabase.rpc("is_app_root", { p_uid: uid });
      if (error) throw error;

      const val = !!data;
      setIsAppRoot(val);
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), val }));
    } catch (e) {
      console.warn("[AuthContext] is_app_root error:", e);
      setIsAppRoot(false);
    } finally {
      setLoadingRoot(false);
    }
  }

  async function loadOrgAndRole(uid) {
    try {
      // 1) preferir memberships
      const { data: mems, error: memErr } = await supabase
        .from("memberships")
        .select("org_id, role, organizations:org_id (id,name,slug)")
        .eq("user_id", uid)
        .order("org_id", { ascending: true });

      if (!memErr && Array.isArray(mems) && mems.length) {
        const first = mems[0];
        setCurrentOrg(first.organizations ?? { id: first.org_id });
        setCurrentRole(first.role ?? null);
        return;
      }

      // 2) fallback a app_user_roles
      const { data: roles, error: roleErr } = await supabase
        .from("app_user_roles")
        .select("org_id, role, organizations:org_id (id,name,slug)")
        .eq("user_id", uid)
        .order("org_id", { ascending: true });

      if (!roleErr && Array.isArray(roles) && roles.length) {
        const first = roles[0];
        setCurrentOrg(first.organizations ?? { id: first.org_id });
        setCurrentRole(first.role ?? null);
        return;
      }

      setCurrentOrg(null);
      setCurrentRole(null);
    } catch (e) {
      console.warn("[AuthContext] loadOrgAndRole error:", e);
      setCurrentOrg(null);
      setCurrentRole(null);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function init() {
      setLoadingAuth(true);
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session ?? null;

        if (!mounted) return;

        const u = session?.user ?? null;
        setUser(u);

        if (u?.id) {
          await Promise.all([loadIsAppRoot(u.id), loadOrgAndRole(u.id)]);
        } else {
          // ✅ clave: si no hay user, NO dejar loadingRoot en true
          setIsAppRoot(false);
          setCurrentOrg(null);
          setCurrentRole(null);
          setLoadingRoot(false);
        }
      } finally {
        if (mounted) setLoadingAuth(false);
      }
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u);

      if (u?.id) {
        await Promise.all([loadIsAppRoot(u.id), loadOrgAndRole(u.id)]);
      } else {
        setIsAppRoot(false);
        setCurrentOrg(null);
        setCurrentRole(null);
        setLoadingRoot(false);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const loading = loadingAuth || loadingRoot;

  const value = useMemo(
    () => ({
      loading,
      user,

      currentOrg,
      setCurrentOrg,
      currentRole,
      setCurrentRole,

      isAppRoot,

      safeText,
      supabase,
    }),
    [loading, user, currentOrg, currentRole, isAppRoot]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() debe usarse dentro de <AuthProvider>");
  return ctx;
}
