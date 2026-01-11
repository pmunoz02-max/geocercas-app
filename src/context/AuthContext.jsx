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

  // 1) Sesión/Auth
  useEffect(() => {
    let mounted = true;

    async function init() {
      setLoadingAuth(true);
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(data?.session?.user ?? null);
      setLoadingAuth(false);
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // 2) Resolver isAppRoot desde BD (RPC universal)
  useEffect(() => {
    let mounted = true;

    async function loadIsRoot() {
      if (!user?.id) {
        if (mounted) {
          setIsAppRoot(false);
          setLoadingRoot(false);
        }
        return;
      }

      try {
        setLoadingRoot(true);

        // Cache corto (15 min) por UX/performance
        const cacheKey = `is_app_root_v1:${user.id}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          const ageMs = Date.now() - (parsed?.ts || 0);
          if (typeof parsed?.val === "boolean" && ageMs < 15 * 60 * 1000) {
            if (mounted) setIsAppRoot(parsed.val);
          }
        }

        const { data, error } = await supabase.rpc("is_app_root", { p_uid: user.id });
        if (error) throw error;

        const val = !!data;
        if (mounted) setIsAppRoot(val);
        localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), val }));
      } catch (e) {
        console.warn("[AuthContext] is_app_root failed (fallback false)", e);
        if (mounted) setIsAppRoot(false);
      } finally {
        if (mounted) setLoadingRoot(false);
      }
    }

    loadIsRoot();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  // 3) Org/Role (fuente principal: memberships)
  useEffect(() => {
    let mounted = true;

    async function loadOrgAndRole() {
      if (!user?.id) {
        if (mounted) {
          setCurrentOrg(null);
          setCurrentRole(null);
        }
        return;
      }

      try {
        // memberships: (user_id, org_id, role)
        const { data: rows, error } = await supabase
          .from("memberships")
          .select("org_id, role")
          .eq("user_id", user.id);

        if (error) throw error;

        const first = Array.isArray(rows) && rows.length ? rows[0] : null;
        if (!mounted) return;

        setCurrentRole(first?.role ?? null);

        if (first?.org_id) {
          const { data: org, error: orgErr } = await supabase
            .from("organizations")
            .select("id, name")
            .eq("id", first.org_id)
            .maybeSingle();

          if (orgErr) throw orgErr;
          setCurrentOrg(org ?? { id: first.org_id, name: "Org" });
        } else {
          setCurrentOrg(null);
        }
      } catch (e) {
        console.warn("[AuthContext] loadOrgAndRole failed", e);
        if (mounted) {
          setCurrentOrg(null);
          setCurrentRole(null);
        }
      }
    }

    loadOrgAndRole();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const loading = loadingAuth || loadingRoot;

  const value = useMemo(
    () => ({
      loading,
      user,
      currentOrg,
      currentRole,
      isAppRoot,
      // útiles para debug/telemetría UI sin romper render:
      debug: {
        role: safeText(currentRole),
        orgId: safeText(currentOrg?.id),
        isAppRoot: !!isAppRoot,
      },
    }),
    [loading, user, currentOrg, currentRole, isAppRoot]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
