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

function normalizeOrgRow(o) {
  if (!o) return null;
  return {
    id: o.id ?? o.org_id ?? null,
    name: o.name ?? o.org_name ?? "Organización",
    ...o,
  };
}

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [profile, setProfile] = useState(null);
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
  // LOAD ALL (UNIFICADO)
  // -----------------------------
  const loadAll = useCallback(async () => {
    try {
      setLoading(true);

      if (!user) {
        setProfile(null);
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

      // 2) ROLES (FUENTE ÚNICA)
      const { data: roleRows = [] } = await supabase
        .from("app_user_roles")
        .select("org_id, role");

      // Orden: OWNER > ADMIN > TRACKER
      roleRows.sort((a, b) => roleRank(b.role) - roleRank(a.role));

      const orgIds = roleRows.map(r => r.org_id).filter(Boolean);

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

      // 4) ORG ACTIVA (regla SaaS)
      let activeOrg = null;

      // 4.1 Donde es OWNER
      const ownerRow = roleRows.find(r => r.role === "owner");
      if (ownerRow) {
        activeOrg = orgs.find(o => o.id === ownerRow.org_id);
      }

      // 4.2 localStorage
      if (!activeOrg) {
        const stored = localStorage.getItem("current_org_id");
        if (stored) {
          activeOrg = orgs.find(o => o.id === stored) ?? null;
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

      // 5) ROLE EFECTIVO (solo app_user_roles)
      const activeRole =
        roleRows.find(r => r.org_id === activeOrg?.id)?.role ??
        roleRows[0]?.role ??
        "tracker";

      setRole(activeRole.toLowerCase());
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
      const o = organizations.find(x => x.id === orgId);
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
      currentOrg,
      tenantId,
      role,
      isOwner: role === "owner",
      isAdmin: role === "admin" || role === "owner",
      loading,
      reloadAuth: loadAll,
      selectOrg,
    }),
    [session, user, profile, organizations, currentOrg, tenantId, role, loading, loadAll, selectOrg]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
