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

function normalizeOrgRow(o) {
  if (!o) return null;
  return {
    id: o.id ?? o.org_id ?? o.tenant_id ?? null,
    name: o.name ?? o.org_name ?? "Organización",
    suspended: Boolean(o.suspended),
    active: o.active !== false,
  };
}

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "")
  );
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

  // Root Owner global
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
  // LOAD ALL
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

      // Orden estable
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

      // 4) Selección de org activa
      let activeOrg = null;

      // =========================================================
      // ✅ FIX "INVITE TRACKER" (ONE-SHOT, NO ROMPE CASOS ADMIN/OWNER)
      // Usa user_metadata.* aunque se pierda el querystring.
      // Solo se aplica una vez por usuario.
      // =========================================================
      const meta = user?.user_metadata || {};
      const metaInvitedRole = String(meta?.invited_role || "").toUpperCase();
      const metaTrackerOrgId = meta?.tracker_org_id;

      const consumedKey = `tracker_invite_consumed:${user.id}`;
      const consumed = localStorage.getItem(consumedKey) === "1";

      if (
        !consumed &&
        metaInvitedRole === "TRACKER" &&
        isUuid(metaTrackerOrgId)
      ) {
        // Solo forzar si realmente el usuario es TRACKER en esa org
        const membershipInMetaOrg = mRows.find(
          (m) => m.org_id === metaTrackerOrgId
        );
        const roleInMetaOrg = String(membershipInMetaOrg?.role || "").toLowerCase();

        if (roleInMetaOrg === "tracker") {
          const forced = orgs.find((o) => o.id === metaTrackerOrgId) ?? null;
          if (forced) {
            activeOrg = forced;
            // Marcamos consumido para no “secuestrar” futuros logins
            localStorage.setItem(consumedKey, "1");
            // Persistimos org activa
            localStorage.setItem("current_org_id", metaTrackerOrgId);
          }
        }
      }

      // =========================================================
      // Tu prioridad original (OWNER) — solo si no hubo force tracker
      // =========================================================
      if (!activeOrg) {
        const ownerMembership = mRows.find(
          (m) => String(m.role).toLowerCase() === "owner"
        );
        if (ownerMembership) {
          activeOrg = orgs.find((o) => o.id === ownerMembership.org_id) ?? null;
        }
      }

      // localStorage current_org_id (siempre que no haya owner)
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

      // 5) ✅ Rol efectivo: SOLO por org activa
      const activeMembership = mRows.find((m) => m.org_id === activeOrg?.id);
      const resolvedRole = String(
        activeMembership?.role ?? prof?.role ?? "tracker"
      ).toLowerCase();

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

      // Rol por org seleccionada
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
