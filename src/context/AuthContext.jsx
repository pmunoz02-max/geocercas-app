import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext(null);

const safeText = (v) =>
  typeof v === "string" || typeof v === "number" ? String(v) : "";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [currentOrg, setCurrentOrg] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);

  const [isAppRoot, setIsAppRoot] = useState(false);

  async function loadIsAppRoot(uid) {
    try {
      const cacheKey = `is_app_root_v1:${uid}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const ageMs = Date.now() - (parsed?.ts || 0);
        if (typeof parsed?.val === "boolean" && ageMs < 15 * 60 * 1000) {
          setIsAppRoot(parsed.val);
          return;
        }
      }

      // IMPORTANT: parameter name must match SQL function
      const { data, error } = await supabase.rpc("is_app_root", {
        p_user_id: uid,
      });
      if (error) throw error;

      const val = !!data;
      setIsAppRoot(val);
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), val }));
    } catch (e) {
      console.warn("[AuthContext] is_app_root error:", e);
      setIsAppRoot(false);
    }
  }

  async function loadOrgAndRole(uid) {
    try {
      const { data: mems } = await supabase
        .from("memberships")
        .select("org_id, role, organizations:org_id (id,name,slug)")
        .eq("user_id", uid)
        .order("org_id", { ascending: true });

      if (Array.isArray(mems) && mems.length) {
        const first = mems[0];
        setCurrentOrg(first.organizations ?? { id: first.org_id });
        setCurrentRole(first.role ?? null);
        return;
      }

      const { data: roles } = await supabase
        .from("app_user_roles")
        .select("org_id, role, organizations:org_id (id,name,slug)")
        .eq("user_id", uid)
        .order("org_id", { ascending: true });

      if (Array.isArray(roles) && roles.length) {
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
    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const u = session?.user ?? null;

        setUser(u);
        setLoadingAuth(false);

        if (u?.id) {
          loadIsAppRoot(u.id);
          loadOrgAndRole(u.id);
        } else {
          setIsAppRoot(false);
          setCurrentOrg(null);
          setCurrentRole(null);
        }
      }
    );

    return () => {
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const value = useMemo(
    () => ({
      loading: loadingAuth,
      user,

      currentOrg,
      setCurrentOrg,
      currentRole,
      setCurrentRole,

      isAppRoot,

      safeText,
      supabase,
    }),
    [loadingAuth, user, currentOrg, currentRole, isAppRoot]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() debe usarse dentro de <AuthProvider>");
  return ctx;
}
