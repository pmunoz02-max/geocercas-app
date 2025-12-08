// src/context/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext(null);

// Clave para recordar la organización actual en localStorage
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
    if (orgId) window.localStorage.setItem(LS_CURRENT_ORG_ID_KEY, orgId);
    else window.localStorage.removeItem(LS_CURRENT_ORG_ID_KEY);
  } catch {
    // ignorar errores de storage
  }
}

/**
 * Acepta automáticamente la invitación más reciente (si existe)
 * para el usuario actual.
 *
 * LÓGICA:
 * - TRACKER: se une a la organización del que invita (org_invites.org_id)
 * - ADMIN: se crea automáticamente una organización propia (tenants)
 *          y se lo registra como OWNER en user_organizations
 */
async function acceptInviteIfAny(user) {
  if (!user?.email || !user.id) return;

  try {
    const { data: invites, error: invitesErr } = await supabase
      .from("org_invites")
      .select("*")
      .eq("status", "pending")
      .ilike("email", user.email)
      .order("created_at", { ascending: false })
      .limit(1);

    if (invitesErr) {
      console.error("[AuthContext] org_invites error:", invitesErr);
      return;
    }

    const invite = invites?.[0];
    if (!invite) return;

    const roleUpper = String(invite.role || "admin").toUpperCase();

    // ============================================================
    // 🔵 1. SI ES TRACKER → SE AGREGA USANDO LA ORG DEL INVITADOR
    // ============================================================
    if (roleUpper === "TRACKER") {
      const { data: exists, error: existErr } = await supabase
        .from("user_organizations")
        .select("org_id")
        .eq("org_id", invite.org_id)
        .eq("user_id", user.id)
        .limit(1);

      if (existErr) {
        console.error("[AuthContext] user_organizations check error:", existErr);
        return;
      }

      const alreadyMember = exists?.length > 0;

      if (!alreadyMember) {
        const { error: insErr } = await supabase
          .from("user_organizations")
          .insert({
            org_id: invite.org_id,
            user_id: user.id,
            role: "TRACKER",
          });

        if (insErr) {
          console.error("[AuthContext] insert tracker error:", insErr);
          return;
        }
      }

      const { error: updErr } = await supabase
        .from("org_invites")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
        })
        .eq("id", invite.id);

      if (updErr) {
        console.error("[AuthContext] org_invites update error:", updErr);
      }

      return;
    }

    // ============================================================
    // 🔴 2. SI ES ADMIN → CREAR ORGANIZACIÓN PROPIA AUTOMÁTICAMENTE
    // ============================================================
    if (roleUpper === "ADMIN") {
      const orgName = `Organización ${user.email}`;

      // A) Crear tenant propio para este admin
      const { data: newTenant, error: tenantErr } = await supabase
        .from("tenants")
        .insert({
          name: orgName,
          owner_user_id: user.id,
          plan: "free",
        })
        .select("id")
        .single();

      if (tenantErr) {
        console.error("[AuthContext] tenant creation error:", tenantErr);
        return;
      }

      const newOrgId = newTenant.id;

      // B) Registrar su membresía como OWNER en esa nueva organización
      const { error: insErr } = await supabase
        .from("user_organizations")
        .insert({
          org_id: newOrgId,
          user_id: user.id,
          role: "OWNER",
        });

      if (insErr) {
        console.error("[AuthContext] insert owner membership error:", insErr);
        return;
      }

      // C) Marcar invitación como aceptada
      const { error: updErr } = await supabase
        .from("org_invites")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
        })
        .eq("id", invite.id);

      if (updErr) {
        console.error("[AuthContext] org_invites update error:", updErr);
      }

      return;
    }

    // Si aparece algún otro rol raro, por ahora no hacemos nada especial.
  } catch (e) {
    console.error("[AuthContext] acceptInviteIfAny exception:", e);
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

  // --------------------------
  // 2) Cargar datos del usuario
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
        // 2.a) Aceptar invitaciones pendientes (si existen)
        await acceptInviteIfAny(user);

        // 2.b) Perfil
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

        // 3) Leer memberships (user_organizations)
        let orgLinks = [];
        try {
          const { data: links, error: linksErr } = await supabase
            .from("user_organizations")
            .select("org_id, role, created_at")
            .eq("user_id", user.id);

          if (linksErr) {
            console.error(
              "[AuthContext] user_organizations error:",
              linksErr
            );
          } else {
            orgLinks = links || [];
          }
        } catch (e) {
          console.error("[AuthContext] user_organizations exception:", e);
        }

        // 🔴 IMPORTANTE:
        // AQUÍ ANTES LLAMÁBAMOS ensure_owner_org_for_user CUANDO orgLinks.length === 0
        // LO QUITAMOS PARA EVITAR ERRORES 400 Y NO TOCAR NADA DE BACKEND.
        // Los nuevos tenants se crean ahora vía invitaciones ADMIN.

        // 4) Cargar organizaciones asociadas
        let orgs = [];
        if (orgLinks.length > 0) {
          const ids = orgLinks.map((l) => l.org_id);

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
                  const link = orgLinks.find((l) => l.org_id === org.id);
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

        // 5) Seleccionar organización actual
        if (!cancelled) {
          setOrganizations(orgs);

          const storedOrgId = loadStoredOrgId();
          let initialOrg = null;

          if (storedOrgId && orgs.length > 0) {
            initialOrg = orgs.find((o) => o.id === storedOrgId) || null;
          }

          if (!initialOrg && orgs.length > 0) {
            // Preferimos OWNER → luego ADMIN → luego la primera
            initialOrg =
              orgs.find((o) => o.role === "owner") ||
              orgs.find((o) => o.role === "admin") ||
              orgs[0];
          }

          setCurrentOrgState(initialOrg);
          storeOrgId(initialOrg?.id || null);
        }
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
  // 3) Rol normalizado + fallback
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
    storeOrgId(org?.id || null);
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
