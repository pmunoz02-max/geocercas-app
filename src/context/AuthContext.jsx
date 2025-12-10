import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext(null);

// --------------------------------------------------------
//  Utilidades para recordar la organización actual por usuario
// --------------------------------------------------------
const ORG_STORAGE_PREFIX = "app_geocercas_current_org_";

function getOrgStorageKey(userId) {
  if (typeof window === "undefined") return null;
  if (!userId) return null;
  return `${ORG_STORAGE_PREFIX}${userId}`;
}

function loadStoredOrgIdForUser(userId) {
  if (typeof window === "undefined") return null;
  const key = getOrgStorageKey(userId);
  if (!key) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storeOrgIdForUser(userId, orgId) {
  if (typeof window === "undefined") return;
  const key = getOrgStorageKey(userId);
  if (!key) return;
  try {
    if (orgId) {
      window.localStorage.setItem(key, orgId);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignorar errores de storage para no romper la app
  }
}

// --------------------------------------------------------
//  AuthProvider
// --------------------------------------------------------
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [profile, setProfile] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrgState] = useState(null);
  const [loading, setLoading] = useState(true);

  // --------------------------------------------------------
  // 1) Inicializar sesión
  // --------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (error) {
          console.error("[AuthContext] getSession error:", error);
        }

        const sess = data?.session ?? null;
        setSession(sess);
        setUser(sess?.user ?? null);
      } catch (e) {
        console.error("[AuthContext] getSession exception:", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      // resetear todo cuando se hace logout
      if (!newSession) {
        setProfile(null);
        setOrganizations([]);
        setCurrentOrgState(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // --------------------------------------------------------
  // 2) Cargar perfil + organizaciones + seleccionar org
  // --------------------------------------------------------
  useEffect(() => {
    if (!user) {
      // no hay usuario → limpiar estado
      setProfile(null);
      setOrganizations([]);
      setCurrentOrgState(null);
      return;
    }

    let cancelled = false;

    async function loadUserData() {
      setLoading(true);

      try {
        // 2.a) Perfil (solo para mostrar info en UI)
        try {
          const { data: profiles, error: pErr } = await supabase
            .from("v_app_profiles")
            .select("*")
            .eq("user_id", user.id);

          if (pErr) {
            console.error("[AuthContext] v_app_profiles error:", pErr);
          }

          if (!cancelled) {
            setProfile(profiles?.[0] || null);
          }
        } catch (e) {
          console.error("[AuthContext] v_app_profiles exception:", e);
        }

        // 2.b) Roles reales desde app_user_roles
        let roleLinks = [];
        try {
          const { data: links, error: rErr } = await supabase
            .from("app_user_roles")
            .select("org_id, role, created_at")
            .eq("user_id", user.id);

          if (rErr) {
            console.error("[AuthContext] app_user_roles error:", rErr);
          }

          roleLinks = links || [];
        } catch (e) {
          console.error("[AuthContext] app_user_roles exception:", e);
        }

        // 2.c) Cargar organizaciones donde el usuario tiene algún rol
        let orgs = [];
        if (roleLinks.length > 0) {
          const ids = Array.from(
            new Set(roleLinks.map((l) => l.org_id).filter(Boolean))
          );

          if (ids.length > 0) {
            try {
              const { data: orgRows, error: oErr } = await supabase
                .from("organizations")
                .select("id, name, slug")
                .in("id", ids);

              if (oErr) {
                console.error("[AuthContext] organizations error:", oErr);
              }

              orgs =
                orgRows?.map((o) => {
                  const link = roleLinks.find((l) => l.org_id === o.id);
                  return {
                    ...o,
                    role: link?.role
                      ? link.role.toLowerCase()
                      : null,
                  };
                }) || [];
            } catch (e) {
              console.error("[AuthContext] organizations exception:", e);
            }
          }
        }

        if (cancelled) return;

        setOrganizations(orgs);

        // --------------------------------------------------------
        // 2.d) Selección UNIVERSAL de organización
        // --------------------------------------------------------
        if (!orgs || orgs.length === 0) {
          // No hay organizaciones con rol → limpiar selección y storage
          setCurrentOrgState(null);
          storeOrgIdForUser(user.id, null);
          return;
        }

        const storedOrgId = loadStoredOrgIdForUser(user.id);

        // 1) Tracker tiene prioridad absoluta (para app tracker pura)
        const trackerOrg = orgs.find((o) => o.role === "tracker");

        // 2) Stored solo si sigue siendo válida y tiene rol
        const storedOrg =
          storedOrgId &&
          orgs.find(
            (o) => o.id === storedOrgId && typeof o.role === "string"
          );

        // 3) Owner → Admin → primera
        const ownerOrg = orgs.find((o) => o.role === "owner");
        const adminOrg = orgs.find((o) => o.role === "admin");

        const initialOrg =
          trackerOrg ||
          storedOrg ||
          ownerOrg ||
          adminOrg ||
          orgs[0] ||
          null;

        setCurrentOrgState(initialOrg);
        storeOrgIdForUser(user.id, initialOrg?.id || null);
      } catch (e) {
        console.error("[AuthContext] loadUserData exception:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadUserData();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // --------------------------------------------------------
  // 3) Normalizar rol actual (multiorg)
  // --------------------------------------------------------
  let normalizedRole = null;

  if (currentOrg?.role) {
    // rol real por organización (fuente principal)
    normalizedRole = currentOrg.role.toLowerCase();
  } else if (profile?.rol) {
    // fallback visual: rol del perfil general (puede venir de sistema viejo)
    normalizedRole = String(profile.rol).toLowerCase();
  }

  // --------------------------------------------------------
  // 4) Valor expuesto por el contexto
  // --------------------------------------------------------
  const value = {
    session,
    user,
    loading,
    profile,
    organizations,
    currentOrg,

    // Permite cambiar de organización desde el selector del header
    setCurrentOrg: (org) => {
      setCurrentOrgState(org);
      if (user?.id) {
        storeOrgIdForUser(user.id, org?.id || null);
      }
    },

    // Rol actual y flags derivados
    role: normalizedRole,
    isTracker: normalizedRole === "tracker",
    isAdmin: ["admin", "owner"].includes(normalizedRole),
    isOwner: normalizedRole === "owner",

    // Tenant actual (org_id)
    tenantId: currentOrg?.id || null,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

// Hook para consumir el contexto
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de un AuthProvider");
  }
  return ctx;
}
