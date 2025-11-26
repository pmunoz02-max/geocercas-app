// src/context/AuthContext.jsx
// MODELO GLOBAL + MULTI-ORG + SELECCIÓN OBLIGATORIA
//----------------------------------------------------

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [profile, setProfile] = useState(null);          // v_app_profiles
  const [organizations, setOrganizations] = useState([]); // my_memberships_app
  const [currentOrg, setCurrentOrg] = useState(null);     // org seleccionada

  const [role, setRole] = useState(null); // owner | admin | tracker
  const [loading, setLoading] = useState(true);

  // ------------------------------------------------------------
  // 1. Cargar sesión inicial + escuchar cambios de autenticación
  // ------------------------------------------------------------
  useEffect(() => {
    let active = true;

    async function loadInitialSession() {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      if (error) console.error("[AuthContext] getSession error:", error);

      setSession(data?.session ?? null);
      setUser(data?.session?.user ?? null);
      setLoading(false);
    }

    loadInitialSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!active) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (!newSession) {
          // LOGOUT → limpiar todo
          setProfile(null);
          setOrganizations([]);
          setCurrentOrg(null);
          setRole(null);
        }
      }
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // ------------------------------------------------------------
  // 2. Cargar perfil, organizaciones y rol global luego del login
  // ------------------------------------------------------------
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setOrganizations([]);
      setCurrentOrg(null);
      setRole(null);
      return;
    }

    let cancelled = false;

    async function loadAuthData() {
      setLoading(true);

      // ---------- 2.1 PERFIL (v_app_profiles) ----------
      const { data: prof, error: profErr } = await supabase
        .from("v_app_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!cancelled) {
        if (profErr) console.error("[AuthContext] profile error:", profErr);
        setProfile(prof ?? null);
      }

      // ---------- 2.2 ORGANIZACIONES (my_memberships_app) ----------
      const { data: orgs, error: orgErr } = await supabase
        .from("my_memberships_app")
        .select("org_id, org_name, org_code")
        .eq("user_id", user.id);

      if (!cancelled) {
        if (orgErr) console.error("[AuthContext] orgs error:", orgErr);

        const normalized =
          orgs?.map((o) => ({
            id: o.org_id,
            name: o.org_name,
            code: o.org_code,
          })) ?? [];

        setOrganizations(normalized);
        // NO seleccionar automáticamente (Opción C)
      }

      // ---------- 2.3 ROL GLOBAL (user_roles_view) ----------
      const { data: rdata, error: rErr } = await supabase
        .from("user_roles_view")
        .select("role_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!cancelled) {
        if (rErr) console.error("[AuthContext] role error:", rErr);
        setRole(rdata?.role_name ?? null);
      }

      if (!cancelled) setLoading(false);
    }

    loadAuthData();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ------------------------------------------------------------
  // 3. Helpers
  // ------------------------------------------------------------
  const isOwner = role === "owner";
  const isAdmin = role === "admin" || role === "owner";
  const isTracker = role === "tracker";

  // ------------------------------------------------------------
  // 4. Valor de contexto
  // ------------------------------------------------------------
  const value = {
    session,
    user,
    loading,

    profile,

    organizations,
    currentOrg,
    setCurrentOrg,

    role,
    isOwner,
    isAdmin,
    isTracker,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
