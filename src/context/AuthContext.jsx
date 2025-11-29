// src/context/AuthContext.jsx
// MODELO GLOBAL + MULTI-ORG + ROL DERIVADO DE user_organizations + v_app_profiles
// Versión estable con:
// - Autocarga de sesión Supabase
// - Carga de organizaciones y roles desde user_organizations
// - Perfil mínimo desde v_app_profiles
// - Persistencia de organización actual en localStorage

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext(null);

// Clave para guardar la organización actual en localStorage
const LS_CURRENT_ORG_ID_KEY = "app_geocercas_current_org_id";

function loadStoredOrgId() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LS_CURRENT_ORG_ID_KEY);
  } catch {
    return null;
  }
}

function storeOrgId(orgId) {
  if (typeof window === "undefined") return;
  try {
    if (orgId) {
      window.localStorage.setItem(LS_CURRENT_ORG_ID_KEY, orgId);
    } else {
      window.localStorage.removeItem(LS_CURRENT_ORG_ID_KEY);
    }
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [profile, setProfile] = useState(null);

  // Lista de organizaciones del usuario: [{ id, name, slug, role }]
  const [organizations, setOrganizations] = useState([]);

  // Organización actualmente seleccionada
  const [currentOrg, setCurrentOrgState] = useState(null);

  // Estado de carga global
  const [loading, setLoading] = useState(true);

  // ---------------------------------------------------------------------------
  // Suscripción a cambios de sesión de Supabase
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("[AuthContext] getSession error:", error);
        }
        if (!isMounted) return;
        setSession(data?.session ?? null);
        setUser(data?.session?.user ?? null);
      } catch (e) {
        console.error("[AuthContext] getSession exception:", e);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (!newSession) {
        // Logout: limpiamos todo
        setProfile(null);
        setOrganizations([]);
        setCurrentOrgState(null);
        storeOrgId(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Carga de perfil + organizaciones y roles cuando hay usuario
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setOrganizations([]);
      setCurrentOrgState(null);
      return;
    }

    let cancelled = false;

    async function loadUserData() {
      setLoading(true);
      try {
        // 1) Perfil mínimo desde v_app_profiles (por email)
        try {
          const { data: profiles, error: profErr } = await supabase
            .from("v_app_profiles")
            .select("*")
            .eq("email", user.email);

          if (profErr) {
            console.error("[AuthContext] v_app_profiles error:", profErr);
          }
          const profileRow = Array.isArray(profiles) ? profiles[0] : null;
          if (!cancelled) {
            setProfile(profileRow || null);
          }
        } catch (e) {
          console.error("[AuthContext] v_app_profiles exception:", e);
          if (!cancelled) {
            setProfile(null);
          }
        }

        // 2) Organizaciones + rol desde user_organizations
        let orgLinks = [];
        try {
          const { data: links, error: linksErr } = await supabase
            .from("user_organizations")
            .select("org_id, role")
            .eq("user_id", user.id);

          if (linksErr) {
            console.error("[AuthContext] user_organizations error:", linksErr);
          } else {
            orgLinks = links || [];
          }
        } catch (e) {
          console.error("[AuthContext] user_organizations exception:", e);
        }

        let orgs = [];
        if (orgLinks.length > 0) {
          const orgIds = orgLinks.map((l) => l.org_id);
          try {
            const { data: orgRows, error: orgErr } = await supabase
              .from("organizations")
              .select("id, name, slug")
              .in("id", orgIds);

            if (orgErr) {
              console.error("[AuthContext] organizations error:", orgErr);
            } else {
              orgs =
                orgRows?.map((org) => {
                  const link = orgLinks.find((l) => l.org_id === org.id);
                  return {
                    ...org,
                    role: link?.role || null, // 'OWNER' | 'ADMIN' | 'TRACKER'
                  };
                }) || [];
            }
          } catch (e) {
            console.error("[AuthContext] organizations exception:", e);
          }
        }

        if (!cancelled) {
          setOrganizations(orgs);

          // Restaurar o elegir organización actual
          const storedOrgId = loadStoredOrgId();
          let initialOrg = null;

          if (storedOrgId && orgs.length > 0) {
            initialOrg = orgs.find((o) => o.id === storedOrgId) || null;
          }

          if (!initialOrg && orgs.length > 0) {
            // Preferimos OWNER > ADMIN > cualquiera
            initialOrg =
              orgs.find((o) => o.role === "OWNER") ||
              orgs.find((o) => o.role === "ADMIN") ||
              orgs[0];
          }

          setCurrentOrgState(initialOrg);
          storeOrgId(initialOrg?.id || null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadUserData();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // ---------------------------------------------------------------------------
  // Derivar rol actual normalizado (minúsculas) según currentOrg
  // ---------------------------------------------------------------------------
  let normalizedRole = null;
  if (currentOrg?.role) {
    normalizedRole = String(currentOrg.role).toLowerCase();
  } else if (profile?.role) {
    // fallback: rol del perfil si existiera
    normalizedRole = String(profile.role).toLowerCase();
  }

  const isOwner = normalizedRole === "owner";
  const isAdmin = normalizedRole === "admin" || isOwner;
  const isTracker = normalizedRole === "tracker";

  // ---------------------------------------------------------------------------
  // Setter de organización actual con persistencia
  // ---------------------------------------------------------------------------
  const setCurrentOrg = (org) => {
    setCurrentOrgState(org);
    storeOrgId(org?.id || null);
  };

  const value = {
    // Sesión Supabase
    session,
    user,
    loading,

    // Perfil mínimo (v_app_profiles)
    profile,

    // Multi-organización
    organizations,
    currentOrg,
    setCurrentOrg,

    // Rol lógico
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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de un AuthProvider");
  }
  return ctx;
}
