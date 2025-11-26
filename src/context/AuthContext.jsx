// src/context/AuthContext.jsx
// MODELO GLOBAL + MULTI-ORG + SELECCIÓN OBLIGATORIA

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [profile, setProfile] = useState(null); // v_app_profiles
  const [organizations, setOrganizations] = useState([]); // lista de orgs del usuario
  const [currentOrg, setCurrentOrgState] = useState(null); // org seleccionada

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
          setCurrentOrgState(null);
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
      setCurrentOrgState(null);
      setRole(null);
      return;
    }

    let cancelled = false;

    async function loadAuthData() {
      setLoading(true);

      // ---------- 2.1 PERFIL (v_app_profiles) ----------
      try {
        const { data: prof, error: profErr } = await supabase
          .from("v_app_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!cancelled) {
          if (profErr)
            console.error("[AuthContext] profile error:", profErr);
          setProfile(prof ?? null);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("[AuthContext] profile exception:", e);
          setProfile(null);
        }
      }

      // ---------- 2.2 ORGANIZACIONES (user_organizations + organizations) ----------
      try {
        const { data: orgRows, error: orgErr } = await supabase
          .from("user_organizations")
          .select(
            `
            org_id,
            role,
            organizations!inner (
              id,
              name,
              slug
            )
          `
          )
          .eq("user_id", user.id);

        if (!cancelled) {
          if (orgErr) console.error("[AuthContext] orgs error:", orgErr);

          const normalized =
            orgRows?.map((row) => ({
              id: row.org_id ?? row.organizations?.id,
              name: row.organizations?.name ?? "(sin nombre)",
              code: row.organizations?.slug ?? null,
              role: row.role ?? null,
            })) ?? [];

          setOrganizations(normalized);

          // Opción: si solo tiene una organización, podrías seleccionarla automáticamente
          // if (normalized.length === 1) {
          //   setCurrentOrgState(normalized[0]);
          // }
        }
      } catch (e) {
        if (!cancelled) {
          console.error("[AuthContext] organizations exception:", e);
          setOrganizations([]);
        }
      }

      // ---------- 2.3 ROL GLOBAL (user_roles_view) ----------
      try {
        const { data: rdata, error: rErr } = await supabase
          .from("user_roles_view")
          .select("role_name")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!cancelled) {
          if (rErr) console.error("[AuthContext] role error:", rErr);
          const r =
            rdata?.role_name?.toString().trim().toLowerCase() ?? null;
          setRole(r);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("[AuthContext] role exception:", e);
          setRole(null);
        }
      }

      if (!cancelled) setLoading(false);
    }

    loadAuthData();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ------------------------------------------------------------
  // 3. Helper setCurrentOrg (acepta id o objeto)
  // ------------------------------------------------------------
  function setCurrentOrg(next) {
    if (!next) {
      setCurrentOrgState(null);
      return;
    }

    // Si viene un string, asumimos que es id o code
    if (typeof next === "string") {
      const found =
        organizations.find(
          (o) => o.id === next || o.code === next || o.org_id === next
        ) || null;
      setCurrentOrgState(found);
      return;
    }

    // Si viene un objeto, normalizamos
    const normalized = {
      id: next.id || next.org_id || null,
      name: next.name || next.org_name || null,
      code: next.code || next.org_code || null,
      role:
        next.role ??
        next.org_role ??
        (typeof next.role_name === "string"
          ? next.role_name.toLowerCase()
          : null),
    };

    setCurrentOrgState(normalized);
  }

  // ------------------------------------------------------------
  // 4. Derivados de rol
  // ------------------------------------------------------------
  const normalizedRole = (role || "").toString().trim().toLowerCase();
  const isOwner = normalizedRole === "owner";
  const isAdmin =
    normalizedRole === "admin" || normalizedRole === "owner";
  const isTracker = normalizedRole === "tracker";

  // ------------------------------------------------------------
  // 5. Valor de contexto
  // ------------------------------------------------------------
  const value = {
    session,
    user,
    loading,

    profile,

    organizations,
    orgs: organizations, // alias para componentes antiguos (OrgSelector, etc.)
    currentOrg,
    setCurrentOrg,

    role: normalizedRole,
    currentRole: normalizedRole, // alias usado por TrackerDashboard, etc.
    isOwner,
    isAdmin,
    isTracker,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}
