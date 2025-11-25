// src/context/AuthProvider.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  supabase,
  getSessionSafe,
  getProfileSafe,
  onAuthChange,
} from "../supabaseClient.js";

type OrgInfo = {
  id: string;
  name: string;
  role: string | null;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;

  profile: any | null;
  role: string | null;

  orgs: OrgInfo[];
  currentOrg: string | null;
  setCurrentOrg: (orgId: string | null) => void;

  signInWithEmailPassword: (
    email: string,
    password: string
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  profile: null,
  role: null,
  orgs: [],
  currentOrg: null,
  setCurrentOrg: () => {},
  signInWithEmailPassword: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [currentOrg, setCurrentOrgState] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // --- helper para exponer en el contexto ---
  const setCurrentOrg = (orgId: string | null) => {
    setCurrentOrgState(orgId);
  };

  useEffect(() => {
    let alive = true;

    async function loadAll() {
      setLoading(true);

      // 1) Sesión
      const s = await getSessionSafe();
      if (!alive) return;

      setSession(s);
      const u = s?.user ?? null;
      setUser(u);

      if (!u) {
        setProfile(null);
        setRole(null);
        setOrgs([]);
        setCurrentOrgState(null);
        setLoading(false);
        return;
      }

      // 2) Perfil (usa helper, respeta RLS)
      const prof = await getProfileSafe();
      if (!alive) return;
      setProfile(prof ?? null);

      // 3) Memberships / organizaciones
      const { data: memberships, error: memError } = await supabase
        .from("my_memberships")
        .select("org_id, org_name, role, created_at")
        .eq("user_id", u.id)
        .order("created_at", { ascending: true });

      if (memError) {
        console.error("[AuthProvider] Error cargando my_memberships:", memError);
      }

      const rows = (memberships as any[]) ?? [];

      const orgsClean: OrgInfo[] = rows.map((m) => ({
        id: m.org_id,
        name: m.org_name || "(Sin nombre)",
        role: m.role ? String(m.role).toUpperCase() : null,
      }));

      setOrgs(orgsClean);

      // 4) Elegir organización actual
      let chosenOrgId: string | null = null;

      const preferred = orgsClean.find(
        (o) => o.role === "OWNER" || o.role === "ADMIN"
      );
      if (preferred) {
        chosenOrgId = preferred.id;
      } else if (orgsClean[0]) {
        chosenOrgId = orgsClean[0].id;
      }

      setCurrentOrgState(chosenOrgId);

      // 5) Rol "global" para UI (header, permisos de edición, etc.)
      const globalRole =
        preferred?.role ??
        (prof?.role ? String(prof.role).toUpperCase() : orgsClean[0]?.role) ??
        null;

      setRole(globalRole ?? null);
      setLoading(false);
    }

    // Carga inicial
    loadAll();

    // Reaccionar a cambios de sesión (login/logout, magic links, etc.)
    const off = onAuthChange((_event, newSession) => {
      if (!alive) return;
      setSession(newSession ?? null);
      setUser(newSession?.user ?? null);
      loadAll();
    });

    return () => {
      alive = false;
      try {
        off?.();
      } catch {
        // no-op
      }
    };
  }, []);

  const signInWithEmailPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: (error as unknown as Error) ?? null };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error: (error as unknown as Error) ?? null };
  };

  const value: AuthContextType = useMemo(
    () => ({
      session,
      user,
      loading,
      profile,
      role,
      orgs,
      currentOrg,
      setCurrentOrg,
      signInWithEmailPassword,
      signOut,
    }),
    [session, user, loading, profile, role, orgs, currentOrg]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  }
  return ctx;
}
