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

  // ===== BOOTSTRAP INICIAL =====
  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

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
    };

    bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  // ===== LISTENER AUTH =====
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s ?? null);

      if (s?.user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", s.user.id)
          .maybeSingle();
        setProfile(prof ?? null);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const role = useMemo(() => profile?.role ?? null, [profile]);
  const isRootOwner = role === "root_owner";

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      role,
      isRootOwner,
      loading,
      supabase,
      reloadAuth: async () => {
        const { data } = await supabase.auth.getSession();
        setSession(data?.session ?? null);
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, profile, role, isRootOwner, loading]
  );

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center text-gray-600">
        Verificando sesión…
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
