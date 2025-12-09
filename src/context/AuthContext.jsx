import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext(null);

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
  } catch {}
}

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

        if (error) console.error("[AuthContext] getSession error:", error);

        setSession(data?.session ?? null);
        setUser(data?.session?.user ?? null);
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
      setProfile(null);
      setOrganizations([]);
      setCurrentOrgState(null);
      return;
    }

    let cancelled = false;

    async function loadUserData() {
      setLoading(true);

      try {
        // 2.a) Perfíl
        try {
          const { data: profiles } = await supabase
            .from("v_app_profiles")
            .select("*")
            .eq("user_id", user.id);
          if (!cancelled) setProfile(profiles?.[0] || null);
        } catch (e) {
          console.error("[AuthContext] v_app_profiles exception:", e);
        }

        // 2.b) Roles reales desde app_user_roles
        let roleLinks = [];
        try {
          const { data: links } = await supabase
            .from("app_user_roles")
            .select("org_id, role, created_at")
            .eq("user_id", user.id);
          roleLinks = links || [];
        } catch (e) {
          console.error("[AuthContext] app_user_roles exception:", e);
        }

        // 2.c) Cargar organizaciones
        let orgs = [];
        if (roleLinks.length > 0) {
          const ids = Array.from(
            new Set(roleLinks.map((l) => l.org_id).filter(Boolean))
          );
          if (ids.length > 0) {
            try {
              const { data: orgRows } = await supabase
                .from("organizations")
                .select("id, name, slug")
                .in("id", ids);

              orgs =
                orgRows?.map((o) => {
                  const link = roleLinks.find((l) => l.org_id === o.id);
                  return { ...o, role: link?.role?.toLowerCase() || null };
                }) || [];
            } catch (e) {
              console.error("[AuthContext] organizations exception:", e);
            }
          }
        }

        if (cancelled) return;

        setOrganizations(orgs);

        // --------------------------------------------------------
        // 🚀 2.d) Selección UNIVERSAL de organización (FIX DEFINITIVO)
        // --------------------------------------------------------

        const storedOrgId = loadStoredOrgIdForUser(user.id);

        // 1) Tracker tiene prioridad absoluta
        const trackerOrg = orgs.find((o) => o.role === "tracker");

        // 2) Stored (solo si coincide con un rol válido)
        const storedOrg =
          storedOrgId && orgs.find((o) => o.id === storedOrgId);

        // 3) Owner → Admin → primera
        const ownerOrg = orgs.find((o) => o.role === "owner");
        const adminOrg = orgs.find((o) => o.role === "admin");

        let initialOrg =
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
  // 3) Normalizar rol actual
  // --------------------------------------------------------
  let normalizedRole = null;

  if (currentOrg?.role) {
    normalizedRole = currentOrg.role.toLowerCase();
  }

  const value = {
    session,
    user,
    loading,
    profile,
    organizations,
    currentOrg,
    setCurrentOrg: (org) => {
      setCurrentOrgState(org);
      if (user?.id) storeOrgIdForUser(user.id, org?.id || null);
    },

    role: normalizedRole,
    isTracker: normalizedRole === "tracker",
    isAdmin: ["admin", "owner"].includes(normalizedRole),
    isOwner: normalizedRole === "owner",

    tenantId: currentOrg?.id || null,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de un AuthProvider");
  return ctx;
}
