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

async function safeSelect(table, queryFn) {
  try {
    const res = await queryFn(supabase.from(table));
    if (res?.error) return { ok: false, error: res.error, data: null };
    return { ok: true, error: null, data: res?.data ?? null };
  } catch (e) {
    return { ok: false, error: e, data: null };
  }
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
  // LOAD ALL (universal)
  // - profile (por email)
  // - memberships: org_members (por auth.uid)
  // - organizations: organizations (por ids)
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
        return;
      }

      // 1) PROFILE (por email)
      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("email", user.email)
        .single();

      if (pErr || !prof) {
        console.error("[AuthContext] Error loading profile:", pErr);
        // Aun sin profile, mantenemos user/sesión.
        setProfile(null);
      } else {
        setProfile(prof);
      }

      // 2) Memberships canónicas desde org_members (auth.uid())
      //    Columnas esperadas: org_id, role, is_active/active (opcional)
      const mRes = await safeSelect("org_members", (q) =>
        q.select("org_id, role, is_active, active, created_at")
      );

      let mRows = Array.isArray(mRes.data) ? mRes.data : [];
      // Filtrar solo activas si la col existe
      mRows = mRows.filter((m) => {
        const a = m?.is_active;
        const b = m?.active;
        // si no hay columna active, se considera activa
        if (typeof a === "boolean") return a === true;
        if (typeof b === "boolean") return b === true;
        return true;
      });

      // Orden: rol más alto primero, luego más reciente
      mRows.sort((a, b) => {
        const ar = roleRank(a?.role);
        const br = roleRank(b?.role);
        if (ar !== br) return br - ar;
        const at = new Date(a?.created_at || 0).getTime();
        const bt = new Date(b?.created_at || 0).getTime();
        return bt - at;
      });

      setMemberships(mRows);

      const orgIds = mRows.map((m) => m.org_id).filter(Boolean);

      // 3) Organizations por ids (si hay)
      let orgs = [];
      if (orgIds.length > 0) {
        const oRes = await safeSelect("organizations", (q) =>
          q.select("*").in("id", orgIds)
        );
        orgs = Array.isArray(oRes.data) ? oRes.data : [];
      }
      setOrganizations(orgs);

      // 4) currentOrg:
      //    - si hay uno guardado en localStorage y el usuario pertenece, preferirlo
      //    - si no, usar la primera org disponible (por rol/recencia)
      const storedOrgId = localStorage.getItem("current_org_id");
      let activeOrg = null;

      if (storedOrgId && orgs.length > 0) {
        activeOrg = orgs.find((o) => o.id === storedOrgId) ?? null;
      }
      if (!activeOrg && orgs.length > 0) {
        activeOrg = orgs[0];
      }

      activeOrg = normalizeOrgRow(activeOrg);

      setCurrentOrg(activeOrg);
      setTenantId(activeOrg?.id ?? null);

      // 5) role para org activa
      let resolvedRole = null;
      if (activeOrg?.id) {
        const mActive = mRows.find((m) => m.org_id === activeOrg.id);
        resolvedRole =
          (mActive?.role || "").toLowerCase() ||
          pickHighestRole(mRows) ||
          (prof?.role || "").toLowerCase() ||
          "tracker";
      } else {
        resolvedRole =
          pickHighestRole(mRows) ||
          (prof?.role || "").toLowerCase() ||
          "tracker";
      }
      setRole(resolvedRole);

      // Persistir selección
      if (activeOrg?.id) {
        localStorage.setItem("current_org_id", activeOrg.id);
      } else {
        localStorage.removeItem("current_org_id");
      }
    } catch (err) {
      console.error("[AuthContext] fatal error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Selector universal (para UI futura: dropdown orgs)
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

  const isOwner = role === "owner";
  const isAdmin = role === "admin" || role === "owner";
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

      role,
      isOwner,
      isAdmin,
      currentRole,

      loading,

      // NUEVO (universal): permite que Onboarding refresque tras crear org
      reloadAuth: loadAll,

      // NUEVO: para selector de org (futuro)
      setCurrentOrg,
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
      isOwner,
      isAdmin,
      currentRole,
      loading,
      loadAll,
      selectOrg,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
