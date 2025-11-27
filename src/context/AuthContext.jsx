// src/context/AuthContext.jsx
// MODELO GLOBAL + MULTI-ORG + ROL DERIVADO DE user_organizations
// Versión con autoselección de organización, persistencia en localStorage
// y flujo de carga robusto (evita rebotes /inicio → /seleccionar-organizacion).

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext(null);

// Clave para guardar la org actual en localStorage
const ORG_STORAGE_KEY = "app_geocercas_current_org_id";

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

  // loadingSession → estamos resolviendo la sesión de Supabase
  // loadingData    → estamos cargando perfil + organizaciones
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);

  const loading = loadingSession || loadingData;

  // ------------------------------------------------------------
  // 1. Cargar sesión inicial + escuchar cambios de autenticación
  // ------------------------------------------------------------
  useEffect(() => {
    let active = true;

    async function loadInitialSession() {
      setLoadingSession(true);
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      if (error) {
        console.error("[AuthContext] getSession error:", error);
      }

      const sess = data?.session ?? null;
      setSession(sess);
      setUser(sess?.user ?? null);
      setLoadingSession(false);
    }

    loadInitialSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!active) return;

        const authUser = newSession?.user ?? null;
        setSession(newSession);
        setUser(authUser);

        if (!newSession) {
          // LOGOUT → limpiar todo inmediatamente
          setProfile(null);
          setOrganizations([]);
          setCurrentOrgState(null);

          try {
            if (typeof window !== "undefined") {
              window.localStorage.removeItem(ORG_STORAGE_KEY);
            }
          } catch (e) {
            console.warn("[AuthContext] localStorage clear on logout:", e);
          }
        }
      }
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // ------------------------------------------------------------
  // 2. Cargar perfil y organizaciones cuando cambia user
  // ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const loadAuthData = async () => {
      if (!user) {
        // Sin usuario → limpiar estado derivado
        setProfile(null);
        setOrganizations([]);
        setCurrentOrgState(null);
        setLoadingData(false);
        return;
      }

      setLoadingData(true);

      // ---------- 2.1 PERFIL (v_app_profiles) ----------
      try {
        const { data: prof, error: profErr } = await supabase
          .from("v_app_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!cancelled) {
          if (profErr) {
            console.error("[AuthContext] profile error:", profErr);
          }
          setProfile(prof ?? null);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("[AuthContext] profile exception:", e);
          setProfile(null);
        }
      }

      // ---------- 2.2 ORGANIZACIONES DESDE user_organizations ----------
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
                role: m.role || null, // OWNER / ADMIN / TRACKER (o variantes)
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

      setLoadingData(false);
    };

    loadAuthData();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ------------------------------------------------------------
  // 3. Autoseleccionar currentOrg cuando cambian profile/orgs
  //    y persistir en localStorage
  // ------------------------------------------------------------

  // 3.1: Elegir org automáticamente en función de:
  //  - localStorage
  //  - profile.active_tenant_id
  //  - primera org disponible
  useEffect(() => {
    if (!user) {
      // Sin usuario, nada que seleccionar
      return;
    }

    if (!organizations || organizations.length === 0) {
      // Usuario sin organizaciones
      setCurrentOrgState(null);
      try {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(ORG_STORAGE_KEY);
        }
      } catch (e) {
        console.warn("[AuthContext] localStorage clear (no orgs):", e);
      }
      return;
    }

    // Si ya hay currentOrg válida dentro de la lista, no tocar
    if (
      currentOrg &&
      organizations.some((o) => o.id === currentOrg.id)
    ) {
      return;
    }

    let nextOrg = null;

    // Intentar por localStorage
    try {
      if (typeof window !== "undefined") {
        const storedId = window.localStorage.getItem(ORG_STORAGE_KEY);
        if (storedId) {
          nextOrg =
            organizations.find((o) => o.id === storedId) || null;
        }
      }
    } catch (e) {
      console.warn("[AuthContext] localStorage read error:", e);
    }

    // Intentar por active_tenant_id (si existe en el perfil)
    if (!nextOrg && profile?.active_tenant_id) {
      nextOrg =
        organizations.find(
          (o) => o.id === profile.active_tenant_id
        ) || null;
    }

    // Si aún no hay, tomar la primera org disponible
    if (!nextOrg) {
      nextOrg = organizations[0] || null;
    }

    setCurrentOrgState(nextOrg || null);
  }, [user, organizations, profile, currentOrg]);

  // 3.2: Persistir currentOrg en localStorage
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (currentOrg && currentOrg.id) {
        window.localStorage.setItem(ORG_STORAGE_KEY, currentOrg.id);
      } else {
        window.localStorage.removeItem(ORG_STORAGE_KEY);
      }
    } catch (e) {
      console.warn("[AuthContext] localStorage write error:", e);
    }
  }, [currentOrg]);

  // ------------------------------------------------------------
  // 4. Helper setCurrentOrg (acepta id o objeto) + normaliza
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
  // 5. Rol derivado de memberships (organizations + currentOrg)
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
  // 6. Valor de contexto
  // ------------------------------------------------------------
  const value = {
    session,
    user,
    loading, // 🔥 ahora significa "sesión y datos listos"

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
