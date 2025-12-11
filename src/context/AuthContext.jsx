import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [tenantId, setTenantId] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);
  const [loading, setLoading] = useState(true);

  //---------------------------------------------
  // LOAD SESSION
  //---------------------------------------------
  useEffect(() => {
    const getSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);
      setUser(session?.user ?? null);
    };

    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  //---------------------------------------------
  // LOAD PROFILE + MEMBERSHIPS + ORGS
  //---------------------------------------------
  useEffect(() => {
    const loadAll = async () => {
      try {
        if (!user) {
          setLoading(false);
          return;
        }

        // 1) LOAD PROFILE FROM REAL TABLE
        const { data: prof, error: pErr } = await supabase
          .from("profiles")
          .select("*")
          .eq("email", user.email)
          .single();

        if (pErr) {
          console.error("Error loading profile:", pErr);
          setLoading(false);
          return;
        }

        setProfile(prof);

        // ⚠️ FIX PRINCIPAL:
        // ESTE ES EL user_id REAL PARA MEMBERSHIPS
        const profileUserId = prof?.id;

        if (!profileUserId) {
          console.warn("Profile has no ID, cannot load memberships.");
          setLoading(false);
          return;
        }

        // 2) LOAD MEMBERSHIPS using profiles.id
        const { data: mRows, error: mErr } = await supabase
          .from("memberships")
          .select("org_id, role, created_at, is_default")
          .eq("user_id", profileUserId); // <--- ARREGLADO

        if (mErr) {
          console.error("Error loading memberships:", mErr);
        }

        setMemberships(mRows || []);

        //---------------------------------------------
        // 3) LOAD ORGANIZATIONS
        //---------------------------------------------
        let orgs = [];

        if (mRows?.length > 0) {
          const orgIds = mRows.map((m) => m.org_id);

          const { data: orgRows, error: oErr } = await supabase
            .from("organizations")
            .select("*")
            .in("id", orgIds);

          if (oErr) {
            console.error("Error loading organizations", oErr);
            setLoading(false);
            return;
          }

          orgs = orgRows || [];
        }

        setOrganizations(orgs);

        //---------------------------------------------
        // 4) DECIDE CURRENT ORGANIZATION
        //---------------------------------------------
        let activeOrg = null;

        if (mRows?.length > 0 && orgs?.length > 0) {
          // Preferir default org si existe
          const defaultMembership = mRows.find((m) => m.is_default);

          if (defaultMembership) {
            activeOrg = orgs.find((o) => o.id === defaultMembership.org_id);
          }

          if (!activeOrg) {
            activeOrg = orgs[0];
          }
        }

        setCurrentOrg(activeOrg);
        setTenantId(activeOrg?.id ?? null);

        //---------------------------------------------
        // 5) ROLE
        //---------------------------------------------
        let role = "tracker";

        if (mRows?.length > 0) {
          role = mRows[0].role || "tracker";
        } else if (prof?.role) {
          role = prof.role;
        }

        setCurrentRole(role);
      } catch (err) {
        console.error("AuthContext fatal error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [user]);

  const value = {
    session,
    user,
    profile,
    organizations,
    memberships,
    currentOrg,
    tenantId,
    currentRole,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
