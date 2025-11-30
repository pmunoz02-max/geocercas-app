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
    if (orgId) {
      window.localStorage.setItem(LS_CURRENT_ORG_ID_KEY, orgId);
    } else {
      window.localStorage.removeItem(LS_CURRENT_ORG_ID_KEY);
    }
  } catch {
    // ignore
  }
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
      console.error("[AuthContext] org_invites select error:", invitesErr);
      return;
    }

    const invite = invites && invites[0];
    if (!invite) return;

    const roleUpper = (invite.role || "admin").toUpperCase();

    const { data: existingRows, error: existErr } = await supabase
      .from("user_organizations")
      .select("org_id, user_id")
      .eq("org_id", invite.org_id)
      .eq("user_id", user.id)
      .limit(1);

    if (existErr) {
      console.error("[AuthContext] user_organizations select error:", existErr);
      return;
    }

    const alreadyMember =
      Array.isArray(existingRows) && existingRows.length > 0;

    if (!alreadyMember) {
      const { error: insErr } = await supabase
        .from("user_organizations")
        .insert({
          org_id: invite.org_id,
          user_id: user.id,
          role: roleUpper,
        });

      if (insErr) {
        console.error("[AuthContext] user_organizations insert error:", insErr);
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
        try {
          await acceptInviteIfAny(user);
        } catch (e) {
          console.error(
            "[AuthContext] acceptInviteIfAny exception (outer):",
            e
          );
        }

        // Perfil mínimo
        try {
          const { data: profiles, error: profErr } = await supabase
            .from("v_app_profiles")
            .select("*")
            .eq("email", user.email);

          if (profErr) {
            console.error("[AuthContext] v_app_profiles error:", profErr);
          }
          const profileRow = Array.isArray(profiles) ? profiles[0] : null;
          if (!cancelled) setProfile(profileRow || null);
        } catch (e) {
          console.error("[AuthContext] v_app_profiles exception:", e);
          if (!cancelled) setProfile(null);
        }

        // user_organizations
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
                    role: link?.role || null,
                  };
                }) || [];
            }
          } catch (e) {
            console.error("[AuthContext] organizations exception:", e);
          }
        }

        if (!cancelled) {
          setOrganizations(orgs);

          const storedOrgId = loadStoredOrgId();
          let initialOrg = null;

          if (storedOrgId && orgs.length > 0) {
            initialOrg = orgs.find((o) => o.id === storedOrgId) || null;
          }

          if (!initialOrg && orgs.length > 0) {
            initialOrg =
              orgs.find((o) => o.role === "OWNER") ||
              orgs.find((o) => o.role === "ADMIN") ||
              orgs[0];
          }

          setCurrentOrgState(initialOrg);
          storeOrgId(initialOrg?.id || null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadUserData();

    return () => {
      cancelled = true;
    };
  }, [user]);

  let normalizedRole = null;
  if (currentOrg?.role) {
    normalizedRole = String(currentOrg.role).toLowerCase();
  } else if (profile?.role) {
    normalizedRole = String(profile.role).toLowerCase();
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
