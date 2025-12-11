import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext();

function roleRank(r) {
  const v = String(r || "").toLowerCase();
  if (v === "owner") return 3;
  if (v === "admin") return 2;
  if (v === "tracker") return 1;
  return 0;
}

function pickHighestRole(memberships = []) {
  let best = "tracker";
  for (const m of memberships) {
    const r = m?.role || "tracker";
    if (roleRank(r) > roleRank(best)) best = r;
  }
  return best;
}

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [profile, setProfile] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [organizations, setOrganizations] = useState([]);

  const [currentOrg, setCurrentOrg] = useState(null);
  const [tenantId, setTenantId] = useState(null);

  // ✅ CANÓNICO
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
        setLoading(true);

        if (!user) {
          setProfile(null);
          setMemberships([]);
          setOrganizations([]);
          setCurrentOrg(null);
          setTenantId(null);
          setRole(null);
          setLoading(false);
          return;
        }

        // 1) PROFILE (por email)
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

        // 2) MEMBERSHIPS (por profiles.id)
        const { data: mRowsRaw, error: mErr } = await supabase
          .from("memberships")
          .select("org_id, role, created_at, is_default")
          .eq("user_id", prof.id);

        if (mErr) console.error("Error loading memberships:", mErr);

        const mRows = (mRowsRaw || []).slice();

        // Orden estable: default primero, luego rol más alto, luego created_at
        mRows.sort((a, b) => {
          const ad = a?.is_default ? 1 : 0;
          const bd = b?.is_default ? 1 : 0;
          if (ad !== bd) return bd - ad;

          const ar = roleRank(a?.role);
          const br = roleRank(b?.role);
          if (ar !== br) return br - ar;

          const at = new Date(a?.created_at || 0).getTime();
          const bt = new Date(b?.created_at || 0).getTime();
          return bt - at;
        });

        setMemberships(mRows);

        // 3) ORGANIZATIONS
        let orgs = [];

        if (mRows.length > 0) {
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

        // 4) CURRENT ORG (default si existe, si no la primera disponible)
        let activeOrg = null;

        if (mRows.length > 0 && orgs.length > 0) {
          const defaultMembership = mRows.find((m) => m.is_default);
          activeOrg =
            orgs.find((o) => o.id === defaultMembership?.org_id) || orgs[0];
        }

        setCurrentOrg(activeOrg);
        setTenantId(activeOrg?.id ?? null);

        // 5) ROLE CANÓNICO (rol de la org activa; si no hay org activa, rol más alto)
        let resolvedRole = null;

        if (activeOrg?.id) {
          const mActive = mRows.find((m) => m.org_id === activeOrg.id);
          resolvedRole =
            mActive?.role || pickHighestRole(mRows) || prof.role || "tracker";
        } else {
          resolvedRole = pickHighestRole(mRows) || prof.role || "tracker";
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

  // Helpers
  const isOwner = role === "owner";
  const isAdmin = role === "admin" || role === "owner";

  // Compatibilidad: algunos componentes viejos usan currentRole
  const currentRole = role;

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      organizations,
      memberships,
      currentOrg,
      tenantId,

      // ✅ contrato único
      role,
      isOwner,
      isAdmin,

      // compatibilidad
      currentRole,

      loading,
    }),
    [
      session,
      user,
      profile,
      organizations,
      memberships,
      currentOrg,
      tenantId,
      role,
      isOwner,
      isAdmin,
      currentRole,
      loading,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
