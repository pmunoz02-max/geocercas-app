// src/context/AuthContext.jsx
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
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
    const r = String(m?.role || "tracker").toLowerCase();
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
  // LOAD ALL (UNIVERSAL + PERMANENT)
  // Fuente de roles: app_user_roles (NO org_members)
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

      // 1) Profile (si tu app depende de esto)
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("email", user.email)
        .maybeSingle();

      if (profErr) console.warn("[AuthContext] profiles error:", profErr);
      setProfile(prof ?? null);

      // 2) Memberships: app_user_roles (fuente real)
      const { data: mRowsRaw, error: mErr } = await supabase
        .from("app_user_roles")
        .select("org_id, role, created_at")
        .eq("user_id", user.id);

      if (mErr) console.error("[AuthContext] app_user_roles error:", mErr);

      const mRows = Array.isArray(mRowsRaw) ? [...mRowsRaw] : [];

      // Orden: rol más alto primero, luego más reciente
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
        const { data, error: orgErr } = await supabase
          .from("organizations")
          .select("*")
          .in("id", orgIds);

        if (orgErr) console.error("[AuthContext] organizations error:", orgErr);
        orgs = data ?? [];
      }

      setOrganizations(orgs);

      // 4) ORG ACTIVA — regla SaaS correcta
      let activeOrg = null;

      // 4.1 Org donde es OWNER (la más “prioritaria” según sort)
      const ownerMembership = mRows.find(
        (m) => String(m.role || "").toLowerCase() === "owner"
      );
      if (ownerMembership) {
        activeOrg = orgs.find((o) => o.id === ownerMembership.org_id) ?? null;
      }

      // 4.2 localStorage (solo si sigue existiendo en orgs permitidas)
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

      if (activeOrg?.id) localStorage.setItem("current_org_id", activeOrg.id);
      else localStorage.removeItem("current_org_id");

      // 5) Role efectivo para la org activa (y fallback si algo raro pasa)
      const activeMembership = mRows.find((m) => m.org_id === activeOrg?.id);
      const resolvedRole = String(
        activeMembership?.role ??
          pickHighestRole(mRows) ??
          prof?.role ??
          "tracker"
      ).toLowerCase();

      setRole(resolvedRole);
    } catch (err) {
      console.error("[AuthContext] fatal error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // -----------------------------
  // SELECT ORG (actualiza también role)
  // -----------------------------
  const selectOrg = useCallback(
    (orgId) => {
      const o = organizations.find((x) => x.id === orgId);
      const active = normalizeOrgRow(o) ?? null;

      setCurrentOrg(active);
      setTenantId(active?.id ?? null);

      if (active?.id) localStorage.setItem("current_org_id", active.id);
      else localStorage.removeItem("current_org_id");

      // actualizar role según membership de esa org (si existe)
      const m = memberships.find((x) => x.org_id === active?.id);
      if (m?.role) setRole(String(m.role).toLowerCase());
      // si no hay membership, mantenemos el role actual (o tracker si null)
      else if (!role) setRole("tracker");
    },
    [organizations, memberships, role]
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
      currentRole: role,

      currentOrgId: currentOrg?.id ?? null,

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
