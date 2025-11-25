import { createContext, useContext, useEffect, useMemo, useState } from "react";
import supabase, { getSessionSafe } from "./supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const u = session?.user ?? null;
        if (!mounted) return;
        setUser(u);
        if (u) await fetchProfile(u.id);
        else setProfile(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) fetchProfile(u.id);
      else setProfile(null);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  async function fetchProfile(userId) {
    try {
      // ✅ Vista con alias: tenant_id, name
      const { data, error } = await supabase
        .from("v_app_profiles")
        .select("id, tenant_id, email, full_name, role, is_active")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.warn("[AuthContext.fetchProfile]", error.message);
        setProfile(null);
        return;
      }
      setProfile(data ?? null);
    } catch (e) {
      console.error("[AuthContext.fetchProfile.exception]", e);
      setProfile(null);
    }
  }

  const signOut = async () => {
    try { await supabase.auth.signOut(); } finally {
      setUser(null);
      setProfile(null);
    }
  };

  const value = useMemo(() => ({ user, profile, loading, signOut }), [user, profile, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
