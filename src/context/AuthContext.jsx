import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
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
    const r = (m?.role || "tracker").toLowerCase();
    if (roleRank(r) > roleRank(best)) best = r;
  }
  return best;
}

function normalizeOrgRow(o) {
  if (!o) return null;
  return {
    id: o.id ?? o.org_id ?? o.tenant_id ?? null,
    name: o.name ?? o.org_name ?? "Organización",
    ...o,
  };
}

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [profile, setProfile] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [organizations, setOrganizations] = useState([]);

  const [currentOrg, setCurrentOrg] = useState(null);
  const [tenantId, setTenantId] = useState(null);
  const [role, setRole] = useState(null);

  const [loading, setLoading] = useState(true);

  // -----------------------------
  // SESSION
  // -----------------------------
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data?.session ?? null);
      setUser(data?.session?.user ?? null);
    };

    init();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // -----------------------------
  // LOAD ALL (FIXED)
  // -----------------------------
  const loadAll = useCallback(async () => {
    try {
      setLoading(true);

      if (!user) {
        setProfile(null);
        setMemberships([]);
        setOrganizations([]);
        setCurrentOrg(null);
        setTenantId(null);
        setRole(null);
        localStorage.removeItem("current_org_id");
        return;
      }

      // 1) Profile
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("email", user.email)
        .single();

      setProfile(prof ?? null);

      // 2) Memberships
      const { data: mRows = [] } = await supabase
        .from("org_members")
        .select("org_id, role, created_at");

      // Orden: OWNER primero, luego más reciente
      mRows.sort((a, b) => {
        const ar = roleRank(a?.role);
        const br = roleRank(b?.role);
        if (ar !== br) return br - ar;
        return new Date(b.created_at) - new Date(a.created_at);
      });

      setMemberships(mRows);

      const orgIds = mRows.map((m) => m.org_id).filter(Boolean);

      // 3) Organizations
      let orgs = [];
      if (orgIds.length) {
        const { data } = await supabase
          .from("organizations")
          .select("*")
          .in("id", orgIds);
        orgs = data ?? [];
      }

      setOrganizations(orgs);

      // 4) ORG ACTIVA — REGLA SaaS CORRECTA
      let activeOrg = null;

      // 4.1 Org donde es OWNER (la más reciente)
      const ownerMembership = mRows.find((m) => m.role === "owner");
      if (ownerMembership) {
        activeOrg = orgs.find((o) => o.id === ownerMembership.org_id);
      }

      // 4.2 localStorage (solo si sigue siendo miembro)
      if (!activeOrg) {
        const storedOrgId = localStorage.getItem("current_org_id");
        if (storedOrgId) {
          activeOrg = orgs.find((o) => o.id === storedOrgId) ?? null;
        }
      }

      // 4.3 fallback
      if (!activeOrg && orgs.length) {
        activeOrg = orgs[0];
      }

      activeOrg = normalizeOrgRow(activeOrg);

      setCurrentOrg(activeOrg);
      setTenantId(activeOrg?.id ?? null);

      if (activeOrg?.id) {
        localStorage.setItem("current_org_id", activeOrg.id);
      } else {
        localStorage.removeItem("current_org_id");
      }

      // 5) Role efectivo
      const activeMembership = mRows.find((m) => m.org_id === activeOrg?.id);
      const resolvedRole =
        activeMembership?.role ??
        pickHighestRole(mRows) ??
        prof?.role ??
        "tracker";

      setRole(resolvedRole.toLowerCase());
    } catch (err) {
      console.error("[AuthContext] fatal error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const selectOrg = useCallback(
    (orgId) => {
      const o = organizations.find((x) => x.id === orgId);
      const active = normalizeOrgRow(o) ?? null;
      setCurrentOrg(active);
      setTenantId(active?.id ?? null);
      if (active?.id) localStorage.setItem("current_org_id", active.id);
      else localStorage.removeItem("current_org_id");
    },
    [organizations]
  );

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      organizations,
      memberships,
      currentOrg,
      tenantId,
      role,
      isOwner: role === "owner",
      isAdmin: role === "admin" || role === "owner",
      loading,
      reloadAuth: loadAll,
      selectOrg,
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
      loading,
      loadAll,
      selectOrg,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
