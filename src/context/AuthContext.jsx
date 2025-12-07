// src/context/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext(null);

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
  } catch {}
}

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
          role: roleUpper,
        });
      if (insErr) {
        console.error("[AuthContext] insert user_organizations error:", insErr);
        return;
      }
    }

    await supabase
      .from("org_invites")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invite.id);
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
  // INIT SESSION
  // --------------------------
  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!isMounted) return;
        setSession(data?.session ?? null);
        setUser(data?.session?.user ?? null);
        if (error) console.error("[AuthContext] getSession error:", error);
      } catch (e) {
        console.error("[AuthContext] getSession exception:", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    init();

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
  // LOAD USER DATA
  // --------------------------
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setOrganizations([]);
      setCurrentOrgState(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        await acceptInviteIfAny(user);

        // PERFIL
        const { data: profiles } = await supabase
          .from("v_app_profiles")
          .select("*")
          .eq("email", user.email);

        if (!cancelled) setProfile(profiles?.[0] || null);

        // ORGANIZATIONS
        let orgLinks = [];
        const { data: links } = await supabase
          .from("user_organizations")
          .select("org_id, role")
          .eq("user_id", user.id);

        orgLinks = links || [];

        // SI NO TIENE ORGANIZACIÓN → crear una para el usuario
        if (orgLinks.length === 0) {
          const { data: newOrgId } = await supabase.rpc(
            "ensure_owner_org_for_user",
            {
              p_user_id: user.id,
              p_email: user.email,
            }
          );

          if (newOrgId) {
            const { data: links2 } = await supabase
              .from("user_organizations")
              .select("org_id, role")
              .eq("user_id", user.id);
            orgLinks = links2 || [];
          }
        }

        // CARGAR ORGANIZATIONS
        let orgs = [];
        if (orgLinks.length > 0) {
          const ids = orgLinks.map((l) => l.org_id);

          const { data: orgRows } = await supabase
            .from("organizations")
            .select("id, name, slug")
            .in("id", ids);

          orgs =
            orgRows?.map((o) => {
              const link = orgLinks.find((l) => l.org_id === o.id);
              return {
                ...o,
                role: link?.role?.toLowerCase() || null, // 🔥 NORMALIZAMOS AQUÍ
              };
            }) || [];
        }

        if (!cancelled) {
          setOrganizations(orgs);

          const storedId = loadStoredOrgId();

          let initial = null;

          if (storedId) {
            initial = orgs.find((o) => o.id === storedId) || null;
          }

          // 🔥 SELECCIÓN CORREGIDA CON ROLES NORMALIZADOS
          if (!initial && orgs.length > 0) {
            initial =
              orgs.find((o) => o.role === "owner") ||
              orgs.find((o) => o.role === "admin") ||
              orgs[0];
          }

          setCurrentOrgState(initial);
          storeOrgId(initial?.id || null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => (cancelled = true);
  }, [user]);

  // --------------------------
  // ROLE NORMALIZADO
  // --------------------------
  const normalizedRole =
    currentOrg?.role?.toLowerCase() ||
    profile?.role?.toLowerCase() ||
    null;

  const isOwner = normalizedRole === "owner";
  const isAdmin = normalizedRole === "admin" || isOwner;
  const isTracker = normalizedRole === "tracker";

  const setCurrentOrg = (org) => {
    setCurrentOrgState(org);
    storeOrgId(org?.id || null);
  };

  return (
    <AuthContext.Provider
      value={{
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de un AuthProvider");
  }
  return ctx;
}
