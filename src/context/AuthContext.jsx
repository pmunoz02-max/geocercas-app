// src/context/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext(null);

// Prefijo para recordar la organización actual POR USUARIO en localStorage
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
    // ignorar errores de storage
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [profile, setProfile] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrgState] = useState(null);
  const [loading, setLoading] = useState(true);

  // --------------------------
  // 1) Inicializar sesión
  // --------------------------
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (error) {
          console.error("[AuthContext] getSession error:", error);
        }

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
        // Logout: limpiamos estado en memoria.
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

  // --------------------------
  // 2) Cargar datos del usuario (perfil + organizaciones)
  // --------------------------
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
        // 2.a) Perfil desde v_app_profiles (solo lectura)
        try {
          const { data: profiles, error: profErr } = await supabase
            .from("v_app_profiles")
            .select("*")
            .eq("user_id", user.id);

          if (profErr) {
            console.error("[AuthContext] v_app_profiles error:", profErr);
          }

          if (!cancelled) {
            setProfile(profiles?.[0] || null);
          }
        } catch (e) {
          console.error("[AuthContext] v_app_profiles exception:", e);
        }

        // 2.b) Preguntar al backend cuál es la org/rol "oficial"
        //     (esta RPC se encarga de crear una org nueva si no existe ninguna)
        let rpcOrg = null;
        try {
          const { data: rpcRows, error: rpcErr } = await supabase.rpc(
            "get_current_user_org_and_role"
          );

          if (rpcErr) {
            console.error(
              "[AuthContext] get_current_user_org_and_role error:",
              rpcErr
            );
          } else if (rpcRows && rpcRows.length > 0) {
            rpcOrg = rpcRows[0]; // { org_id, org_name, role }
          }
        } catch (e) {
          console.error(
            "[AuthContext] get_current_user_org_and_role exception:",
            e
          );
        }

        // 2.c) Leer los roles reales desde app_user_roles
        let roleLinks = [];
        try {
          const { data: links, error: linksErr } = await supabase
            .from("app_user_roles")
            .select("org_id, role, created_at")
            .eq("user_id", user.id);

          if (linksErr) {
            console.error("[AuthContext] app_user_roles error:", linksErr);
          } else {
            roleLinks = links || [];
          }
        } catch (e) {
          console.error("[AuthContext] app_user_roles exception:", e);
        }

        // 2.d) Cargar organizaciones asociadas a partir de app_user_roles
        let orgs = [];
        if (roleLinks.length > 0) {
          const ids = Array.from(
            new Set(
              roleLinks
                .map((l) => l.org_id)
                .filter((id) => !!id)
            )
          );

          if (ids.length > 0) {
            try {
              const { data: orgRows, error: orgErr } = await supabase
                .from("organizations")
                .select("id, name, slug")
                .in("id", ids);

              if (orgErr) {
                console.error("[AuthContext] organizations error:", orgErr);
              } else {
                orgs =
                  orgRows?.map((org) => {
                    const link = roleLinks.find((l) => l.org_id === org.id);
                    return {
                      ...org,
                      role: link?.role
                        ? String(link.role).toLowerCase()
                        : null,
                    };
                  }) || [];
              }
            } catch (e) {
              console.error("[AuthContext] organizations exception:", e);
            }
          }
        }

        if (cancelled) return;

        setOrganizations(orgs);

        // 2.e) Seleccionar organización actual (prefiriendo la de la RPC)
        let initialOrg = null;

        const storedOrgId = loadStoredOrgIdForUser(user.id);

        if (storedOrgId && orgs.length > 0) {
          initialOrg = orgs.find((o) => o.id === storedOrgId) || null;
        }

        if (!initialOrg && rpcOrg && orgs.length > 0) {
          initialOrg = orgs.find((o) => o.id === rpcOrg.org_id) || null;
        }

        if (!initialOrg && orgs.length > 0) {
          // Preferimos OWNER → luego ADMIN → luego la primera
          initialOrg =
            orgs.find((o) => o.role === "owner") ||
            orgs.find((o) => o.role === "admin") ||
            orgs[0];
        }

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

  // --------------------------
  // 3) Rol normalizado + flags
  // --------------------------
  let normalizedRole = null;

  if (currentOrg?.role) {
    normalizedRole = String(currentOrg.role).toLowerCase();
  } else if (profile?.role) {
    normalizedRole = String(profile.role).toLowerCase();
  } else if (organizations && organizations.length > 0) {
    const ownerOrg = organizations.find(
      (o) => String(o.role || "").toLowerCase() === "owner"
    );
    const adminOrg = organizations.find(
      (o) => String(o.role || "").toLowerCase() === "admin"
    );

    if (ownerOrg) {
      normalizedRole = "owner";
    } else if (adminOrg) {
      normalizedRole = "admin";
    }
  }

  const isOwner = normalizedRole === "owner";
  const isAdmin = normalizedRole === "admin" || isOwner;
  const isTracker = normalizedRole === "tracker";

  const setCurrentOrg = (org) => {
    setCurrentOrgState(org);
    if (user?.id) {
      storeOrgIdForUser(user.id, org?.id || null);
    }
  };

  const value = {
    session,
    user,
    loading,

    profile,
    organizations,
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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de un AuthProvider");
  }
  return ctx;
}
