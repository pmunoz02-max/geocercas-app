// src/auth/AuthProvider.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase, getSessionSafe, getProfileSafe } from "../supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);

  const [loading, setLoading] = useState(true);

  // 1️⃣ Cargar sesión inicial
  useEffect(() => {
    let mounted = true;

    (async () => {
      const session = await getSessionSafe();
      if (!mounted) return;

      setSession(session);
      if (!session) {
        setProfile(null);
        setOrgs([]);
        setCurrentOrg(null);
        setLoading(false);
        return;
      }

      // 2️⃣ Cargar perfil (tabla profiles)
      const p = await getProfileSafe();
      if (!mounted) return;

      setProfile(p);

      // 3️⃣ Cargar organizaciones del usuario
      const { data: mOrgs, error } = await supabase
        .from("memberships")
        .select("org_id, role")
        .eq("user_id", session.user.id);

      if (!mounted) return;

      if (error) {
        console.warn("[AuthProvider] memberships error:", error.message);
        setOrgs([]);
        setCurrentOrg(null);
      } else {
        const orgIds = mOrgs?.map((o) => o.org_id) || [];

        if (orgIds.length > 0) {
          const { data: orgRows } = await supabase
            .from("organizations")
            .select("id, name, active, owner_id")
            .in("id", orgIds);

          setOrgs(orgRows || []);

          // Selección automática inicial
          if (orgRows && orgRows.length > 0 && !currentOrg) {
            setCurrentOrg(orgRows[0].id);
          }
        } else {
          setOrgs([]);
          setCurrentOrg(null);
        }
      }

      setLoading(false);
    })();

    // 4️⃣ Suscribirse a cambios de auth
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, newSession) => {
      setSession(newSession ?? null);

      if (!newSession) {
        setProfile(null);
        setOrgs([]);
        setCurrentOrg(null);
      }
    });

    return () => {
      mounted = false;
      try {
        sub?.subscription?.unsubscribe();
      } catch {}
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.role ?? null,
      orgs,
      currentOrg,
      setCurrentOrg,
      loading,
      signOut,
    }),
    [session, profile, orgs, currentOrg, loading]
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
  return useContext(AuthContext);
}
