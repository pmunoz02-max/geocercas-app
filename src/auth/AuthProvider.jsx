// src/auth/AuthProvider.jsx
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../supabaseClient.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // 1️⃣ Cargar sesión inicial
  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);

      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;

      if (error) {
        console.error("[AuthProvider] getSession error:", error);
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setSession(data?.session ?? null);

      if (data?.session?.user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.session.user.id)
          .maybeSingle();
        if (mounted) setProfile(prof ?? null);
      } else {
        setProfile(null);
      }

      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // 2️⃣ Escuchar cambios de sesión (login / logout / refresh)
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setLoading(true);
      setSession(newSession ?? null);

      if (newSession?.user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", newSession.user.id)
          .maybeSingle();
        setProfile(prof ?? null);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const role = useMemo(() => profile?.role ?? null, [profile]);
  const isRootOwner = role === "root_owner";

  const value = useMemo(
    () => ({
      session,
      profile,
      role,
      isRootOwner,
      loading,
      supabase,
      reloadAuth: async () => {
        setLoading(true);
        const { data } = await supabase.auth.getSession();
        setSession(data?.session ?? null);
        if (data?.session?.user) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", data.session.user.id)
            .maybeSingle();
          setProfile(prof ?? null);
        } else {
          setProfile(null);
        }
        setLoading(false);
      },
    }),
    [session, profile, role, isRootOwner, loading]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
}
