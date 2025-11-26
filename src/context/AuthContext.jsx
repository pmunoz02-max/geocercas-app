// src/context/AuthContext.jsx
// MODELO GLOBAL + MULTI-ORG + ROL DERIVADO DE user_organizations

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
  const [organizations, setOrganizations] = useState([]); // orgs del usuario
  const [currentOrg, setCurrentOrgState] = useState(null); // org seleccionada

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
        }
      }
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // ------------------------------------------------------------
  // 2. Cargar perfil y organizaciones luego del login
  // ------------------------------------------------------------
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setOrganizations([]);
      setCurrentOrgState(null);
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

      // ---------- 2.2 ORGANIZACIONES ----------
      let memberships = [];
      try {
        const { data: memData, error: memErr } = await supabase
          .from("user_organizations")
          .select("org_id, role")
          .eq("user_id", user.id);

        if (memErr) {
          console.error("[AuthContext] memberships error:", memErr);
        } else {
          memberships = memData || [];
        }
      } catch (e) {
        console.error("[AuthContext] memberships exception:", e);
      }

      let normalizedOrgs = [];
      if (memberships.length > 0) {
        const orgIds = memberships
          .map((m) => m.org_id)
          .filter((id) => !!id);

        try {
          const { data: orgData, error: orgErr } = await supabase
            .from("organizations")
            .select("id, name, slug")
            .in("id", orgIds);

          if (orgErr) {
            console.error("[AuthContext] organizations error:", orgErr);
          } else {
            const mapById = new Map(
              (orgData || []).map((o) => [o.id, o])
            );

            normalizedOrgs = memberships.map((m) => {
              const org = mapById.get(m.org_id) || {};
              return {
                id: m.org_id,
                name: org.name || "(sin nombre)",
                code: org.slug || null,
                role: m.role || null, // OWNER / ADMIN / TRACKER
              };
            });
          }
        } catch (e) {
          console.error("[AuthContext] organizations exception:", e);
        }
      }

      if (!cancelled) {
        setOrganizations(normalizedOrgs);
      }

      if (!cancelled) setLoading(false);
    }

    loadAuthData();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ------------------------------------------------------------
  // 3. Helper setCurrentOrg (acepta id o objeto) + normaliza
  // ------------------------------------------------------------
  function setCurrentOrg(next) {
    if (!next) {
      setCurrentOrgState(null);
      return;
    }

    if (typeof next === "string") {
      const found =
        organizations.find(
          (o) => o.id === next || o.code === next || o.org_id === next
        ) || null;
      setCurrentOrgState(found);
      return;
    }

    const normalized = {
      id: next.id || next.org_id || null,
      name: next.name || next.org_name || null,
      code: next.code || next.org_code || null,
      role:
        next.role ??
        next.org_role ??
        (typeof next.role_name === "string"
          ? next.role_name
          : null),
    };

    setCurrentOrgState(normalized);
  }

  // ------------------------------------------------------------
  // 4. Rol derivado de memberships (organizations + currentOrg)
  // ------------------------------------------------------------
  let normalizedRole = null;

  if (currentOrg && currentOrg.role) {
    normalizedRole = currentOrg.role.toString().trim().toLowerCase();
  } else if (organizations.length > 0) {
    const roles = organizations
      .map((o) => (o.role || "").toString().trim().toLowerCase())
      .filter(Boolean);

    if (roles.includes("owner")) normalizedRole = "owner";
    else if (roles.includes("admin")) normalizedRole = "admin";
    else if (roles.includes("tracker")) normalizedRole = "tracker";
  }

  const isOwner = normalizedRole === "owner";
  const isAdmin = normalizedRole === "admin" || normalizedRole === "owner";
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
    orgs: organizations, // alias
    currentOrg,
    setCurrentOrg,

    role: normalizedRole,
    currentRole: normalizedRole,
    isOwner,
    isAdmin,
    isTracker,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}
