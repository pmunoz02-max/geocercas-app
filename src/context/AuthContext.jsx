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
  if (v === "viewer") return 0;
  return 0;
}

// Se mantiene por compatibilidad / ordenamiento, pero ya NO se usa para resolver el rol efectivo.
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
    suspended: Boolean(o.suspended),
    active: o.active !== false,
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

  // Rol efectivo (SIEMPRE por org activa)
  const [role, setRole] = useState(null);

  const [isSuspended, setIsSuspended] = useState(false);

  // Root Owner global (Fenice)
  const [isRootOwner, setIsRootOwner] = useState(false);

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
  // LOAD ALL (UNIVERSAL + SAAS READY)
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
        setIsSuspended(false);
        setIsRootOwner(false);
        localStorage.removeItem("current_org_id");
        localStorage.removeItem("force_tracker_org_id");
        return;
      }

      // Root Owner (no rompe si RPC no existe)
      try {
        const { data, error } = await supabase.rpc("is_root_owner");
        if (error) setIsRootOwner(false);
        else setIsRootOwner(Boolean(data));
      } catch (_e) {
        setIsRootOwner(false);
      }

      // 1) Profile
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("email", user.email)
        .maybeSingle();

      setProfile(prof ?? null);

      // 2) Membresías reales (app_user_roles)
      const { data: mRowsRaw } = await supabase
        .from("app_user_roles")
        .select("org_id, role, created_at")
        .eq("user_id", user.id);

      const mRows = Array.isArray(mRowsRaw) ? [...mRowsRaw] : [];

      // Ordenar para estabilidad (no define permisos globales)
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
        const { data } = await supabase.from("organizations").select("*").in("id", orgIds);
        orgs = data ?? [];
      }

      setOrganizations(orgs);

      // 4) Selección de org activa
      let activeOrg = null;

      // ✅ FIX invite tracker (ONE-SHOT):
      // Si viene force_tracker_org_id, lo usamos una sola vez y lo borramos.
      const forcedTrackerOrgId = localStorage.getItem("force_tracker_org_id");
      if (forcedTrackerOrgId) {
        const forced = orgs.find((o) => o.id === forcedTrackerOrgId) ?? null;
        if (forced) {
          activeOrg = forced;
        }
        localStorage.removeItem("force_tracker_org_id");
      }

      // Mantener tu prioridad original si no hubo "force"
      if (!activeOrg) {
        const ownerMembership = mRows.find((m) => String(m.role).toLowerCase() === "owner");
        if (ownerMembership) {
          activeOrg = orgs.find((o) => o.id === ownerMembership.org_id) ?? null;
        }
      }

      if (!activeOrg) {
        const storedOrgId = localStorage.getItem("current_org_id");
        if (storedOrgId) {
          activeOrg = orgs.find((o) => o.id === storedOrgId) ?? null;
        }
      }

      if (!activeOrg && orgs.length) activeOrg = orgs[0];

      activeOrg = normalizeOrgRow(activeOrg);

      setCurrentOrg(activeOrg);
      setTenantId(activeOrg?.id ?? null);
      setIsSuspended(Boolean(activeOrg?.suspended));

      if (activeOrg?.id) localStorage.setItem("current_org_id", activeOrg.id);
      else localStorage.removeItem("current_org_id");

      // 5) ✅ ROL EFECTIVO: SOLO por ORG activa
      const activeMembership = mRows.find((m) => m.org_id === activeOrg?.id);

      const resolvedRole = String(activeMembership?.role ?? prof?.role ?? "tracker").toLowerCase();

      setRole(resolvedRole);
    } catch (err) {
      console.error("[AuthContext] fatal error:", err);
      setRole((prev) => prev ?? "tracker");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // -----------------------------
  // SELECT ORG
  // -----------------------------
  const selectOrg = useCallback(
    (orgId) => {
      const o = organizations.find((x) => x.id === orgId);
      const active = normalizeOrgRow(o) ?? null;

      setCurrentOrg(active);
      setTenantId(active?.id ?? null);
      setIsSuspended(Boolean(active?.suspended));

      if (active?.id) localStorage.setItem("current_org_id", active.id);
      else localStorage.removeItem("current_org_id");

      // ✅ Rol efectivo SIEMPRE por org seleccionada
      const m = memberships.find((x) => x.org_id === active?.id);
      if (m?.role) setRole(String(m.role).toLowerCase());
      else setRole("tracker");
    },
    [organizations, memberships]
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
      currentOrgId: currentOrg?.id ?? null,

      role,
      currentRole: role,

      isOwner: role === "owner",
      isAdmin: role === "admin" || role === "owner",

      isSuspended,

      isRootOwner,

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
      isSuspended,
      isRootOwner,
      loading,
      loadAll,
      selectOrg,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
