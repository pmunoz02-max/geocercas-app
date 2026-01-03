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
  const [orgs, setOrgs] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [loading, setLoading] = useState(true);

  /* =========================
     BOOTSTRAP INICIAL
     ========================= */
  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      setLoading(true);

      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;

      if (error || !data?.session) {
        setSession(null);
        setProfile(null);
        setOrgs([]);
        setCurrentOrg(null);
        setLoading(false);
        return;
      }

      const s = data.session;
      setSession(s);

      // Perfil
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", s.user.id)
        .maybeSingle();

      if (!mounted) return;
      setProfile(prof ?? null);

      // Organizaciones
      const { data: memberships } = await supabase
        .from("memberships")
        .select("org_id")
        .eq("user_id", s.user.id);

      if (!mounted) return;

      if (memberships && memberships.length > 0) {
        const orgIds = memberships.map((m) => m.org_id);
        const { data: orgRows } = await supabase
          .from("organizations")
          .select("id, name, active, owner_id")
          .in("id", orgIds);

        setOrgs(orgRows ?? []);
        if (orgRows && orgRows.length > 0) {
          setCurrentOrg(orgRows[0].id);
        }
      } else {
        setOrgs([]);
        setCurrentOrg(null);
      }

      setLoading(false);
    }

    bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  /* =========================
     LISTENER AUTH
     ========================= */
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setLoading(true);

      if (!newSession) {
        setSession(null);
        setProfile(null);
        setOrgs([]);
        setCurrentOrg(null);
        setLoading(false);
        return;
      }

      setSession(newSession);

      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", newSession.user.id)
        .maybeSingle();

      setProfile(prof ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  /* =========================
     DERIVADOS
     ========================= */
  const role = useMemo(() => profile?.role ?? null, [profile]);
  const isRootOwner = role === "root_owner";

  /* =========================
     API CONTEXTO
     ========================= */
  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      role,
      isRootOwner,
      orgs,
      currentOrg,
      setCurrentOrg,
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
    [session, profile, role, isRootOwner, orgs, currentOrg, loading]
  );

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center text-gray-600">
        Verificando sesión…
      </div>
    );
  }

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
