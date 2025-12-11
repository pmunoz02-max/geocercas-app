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

  // 🔐 CANÓNICO
  const [role, setRole] = useState(null);

  const [loading, setLoading] = useState(true);

  // -------------------------------------------------
  // SESSION
  // -------------------------------------------------
  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);
      setUser(session?.user ?? null);
    };

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // -------------------------------------------------
  // LOAD PROFILE + MEMBERSHIPS + ORGS + ROLE
  // -------------------------------------------------
  useEffect(() => {
    const loadAll = async () => {
      try {
        if (!user) {
          setLoading(false);
          return;
        }

        // 1) PROFILE
        const { data: prof, error: pErr } = await supabase
          .from("profiles")
          .select("*")
          .eq("email", user.email)
          .single();

        if (pErr || !prof) {
          console.error("Error loading profile:", pErr);
          setLoading(false);
          return;
        }

        setProfile(prof);

        const profileUserId = prof.id;

        // 2) MEMBERSHIPS (FUENTE PRINCIPAL DE ROL)
        const { data: mRows, error: mErr } = await supabase
          .from("memberships")
          .select("org_id, role, is_default")
          .eq("user_id", profileUserId);

        if (mErr) {
          console.error("Error loading memberships:", mErr);
        }

        setMemberships(mRows || []);

        // 3) ORGANIZATIONS
        let orgs = [];

        if (mRows?.length > 0) {
          const orgIds = mRows.map((m) => m.org_id);

          const { data: orgRows, error: oErr } = await supabase
            .from("organizations")
            .select("*")
            .in("id", orgIds);

          if (oErr) {
            console.error("Error loading organizations:", oErr);
            setLoading(false);
            return;
          }

          orgs = orgRows || [];
        }

        setOrganizations(orgs);

        // 4) CURRENT ORG
        let activeOrg = null;

        if (mRows?.length > 0 && orgs.length > 0) {
          const defaultMembership = mRows.find((m) => m.is_default);
          activeOrg =
            orgs.find((o) => o.id === defaultMembership?.org_id) || orgs[0];
        }

        setCurrentOrg(activeOrg);
        setTenantId(activeOrg?.id ?? null);

        // 5) ROLE (CANÓNICO)
        let resolvedRole = "tracker";

        if (mRows?.length > 0 && mRows[0].role) {
          resolvedRole = mRows[0].role;
        } else if (prof.role) {
          resolvedRole = prof.role;
        }

        setRole(resolvedRole);
      } catch (err) {
        console.error("AuthContext fatal error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [user]);

  // -------------------------------------------------
  // VALORES EXPUESTOS (CONTRATO ÚNICO)
  // -------------------------------------------------
  const value = {
    session,
    user,
    profile,
    memberships,
    organizations,
    currentOrg,
    tenantId,

    // 👇 ESTO ES LO QUE FALTABA
    role,
    isOwner: role === "owner",
    isAdmin: role === "admin" || role === "owner",

    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
