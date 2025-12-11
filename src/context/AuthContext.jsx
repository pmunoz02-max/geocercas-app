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
  // 2) Cargar perfil + memberships + organizaciones
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
            .eq("user_id", profile?.id);

          if (pErr) {
            console.error("[AuthContext] v_app_profiles error:", pErr);
          }

          if (!cancelled) {
            setProfile(profiles?.[0] || null);
          }
        } catch (e) {
          console.error("[AuthContext] v_app_profiles exception:", e);
        }

        // 2.b) Memberships: roles por organización (modelo nuevo y universal)
        let memberships = [];
        try {
          const profileId = profile?.id || user?.id; // fallback viejo
const { data: mRows, error: mErr } = await supabase
  .from("memberships")
  .select("org_id, role, created_at, is_default")
  .eq("user_id", profileId);

          if (mErr) {
            console.error("[AuthContext] memberships error:", mErr);
          }
          memberships = mRows || [];
        } catch (e) {
          console.error("[AuthContext] memberships exception:", e);
        }

        const membershipMap = new Map();
        const membershipOrgIds = [];
        for (const m of memberships) {
          if (!m?.org_id) continue;
          membershipMap.set(m.org_id, m);
          membershipOrgIds.push(m.org_id);
        }

        // 2.c) Cargar organizaciones donde el usuario tiene membership
        let orgRows = [];
        if (membershipOrgIds.length > 0) {
          try {
            const { data: o1, error: oErr1 } = await supabase
              .from("organizations")
              .select("id, name, slug, owner_id, plan, active")
              .in("id", membershipOrgIds);

            if (oErr1) {
              console.error("[AuthContext] organizations (by memberships) error:", oErr1);
            }
            orgRows = o1 || [];
          } catch (e) {
            console.error(
              "[AuthContext] organizations (by memberships) exception:",
              e
            );
          }
        }

        // 2.d) Agregar también organizaciones donde el usuario es owner,
        //      aunque no tenga fila en memberships (seguridad universal)
        try {
          const { data: ownerRows, error: oErr2 } = await supabase
            .from("organizations")
            .select("id, name, slug, owner_id, plan, active")
            .eq("owner_id", user.id);

          if (oErr2) {
            console.error("[AuthContext] organizations (owner) error:", oErr2);
          }

          if (ownerRows && ownerRows.length > 0) {
            const existingIds = new Set(orgRows.map((o) => o.id));
            for (const o of ownerRows) {
              if (!existingIds.has(o.id)) {
                orgRows.push(o);
              }
            }
          }
        } catch (e) {
          console.error("[AuthContext] organizations (owner) exception:", e);
        }

        if (cancelled) return;

        // 2.e) Normalizar organizaciones con rol efectivo
        const orgs = (orgRows || []).map((o) => {
          const membership = membershipMap.get(o.id) || null;
          const membershipRole = membership?.role
            ? String(membership.role).toLowerCase()
            : null;

          // Regla universal:
          // - Si es owner → rol "owner"
          // - Si no, usar el rol de memberships (admin/tracker/viewer/...)
          const isOwner = o.owner_id === user.id;
          const effectiveRole = isOwner
            ? "owner"
            : membershipRole || null;

          return {
            id: o.id,
            name: o.name,
            slug: o.slug,
            owner_id: o.owner_id,
            plan: o.plan ?? null,
            active: o.active ?? true,
            role: effectiveRole,
            membershipRole,
            isOwner,
          };
        });

        setOrganizations(orgs);

        // --------------------------------------------------------
        // 2.f) Selección UNIVERSAL de organización
        //     Prioridad: almacenada → owner → admin → tracker → viewer → primera
        // --------------------------------------------------------
        if (!orgs || orgs.length === 0) {
          setCurrentOrgState(null);
          storeOrgIdForUser(user.id, null);
          return;
        }

        const storedOrgId = loadStoredOrgIdForUser(user.id);

        const storedOrg =
          storedOrgId &&
          orgs.find((o) => o.id === storedOrgId && typeof o.role === "string");

        const ownerOrg = orgs.find((o) => o.role === "owner" || o.isOwner);
        const adminOrg = orgs.find((o) => o.role === "admin");
        const trackerOrg = orgs.find((o) => o.role === "tracker");
        const viewerOrg = orgs.find((o) => o.role === "viewer");

        const initialOrg =
          storedOrg ||
          ownerOrg ||
          adminOrg ||
          trackerOrg ||
          viewerOrg ||
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
    normalizedRole = String(currentOrg.role).toLowerCase();
  } else if (profile?.rol) {
    // fallback visual: rol del perfil general (sistema viejo)
    normalizedRole = String(profile.rol).toLowerCase();
  }

  const currentRole = normalizedRole;

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

    // Rol actual (para compatibilidad con componentes existentes)
    role: normalizedRole,
    currentRole,
    currentOrgRole: normalizedRole,

    // Flags derivados
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
