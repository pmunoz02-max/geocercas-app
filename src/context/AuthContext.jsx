import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [memberships, setMemberships] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [role, setRole] = useState(null);

  // =========
  // 1) Cargar sesión inicial
  // =========
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        const s = data?.session ?? null;
        setSession(s);
        setUser(s?.user ?? null);
      } catch (e) {
        console.error("[AuthContext] getSession error:", e);
      }
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // =========
  // 2) Cargar memberships cuando hay usuario
  // =========
  useEffect(() => {
    let cancelled = false;

    const loadMemberships = async () => {
      // No hay usuario → nada que cargar
      if (!user) {
        setMemberships([]);
        setCurrentOrg(null);
        setRole(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const { data, error } = await supabase
          .from("user_organizations")
          .select("org_id, role, organizations ( id, name )");

        if (cancelled) return;

        if (error) {
          console.error("[AuthContext] memberships error:", error);
          setMemberships([]);
          setCurrentOrg(null);
          setRole(null);
          setLoading(false);
          return;
        }

        const rows = data || [];
        setMemberships(rows);

        if (rows.length > 0) {
          const first = rows[0];
          setCurrentOrg(first.organizations || null);
          setRole(first.role || null);
        } else {
          // Usuario válido, pero aún sin org
          setCurrentOrg(null);
          setRole(null);
        }
      } catch (e) {
        console.error("[AuthContext] loadMemberships exception:", e);
        setMemberships([]);
        setCurrentOrg(null);
        setRole(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadMemberships();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // =========
  // 3) Valor expuesto
  // =========
  const value = useMemo(
    () => ({
      loading,
      session,
      user,
      memberships,
      currentOrg,
      role,
    }),
    [loading, session, user, memberships, currentOrg, role]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
