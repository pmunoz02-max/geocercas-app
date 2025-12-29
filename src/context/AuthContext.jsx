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

/**
 * Regla de seguridad:
 * - NUNCA usar profiles.role para permitir panel
 * - Si no hay memberships confiables -> TRACKER
 */
function safeRoleFallback() {
  return "tracker";
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

  const [isSuspended, setIsSuspended] = useState(false);
  const [isRootOwner, setIsRootOwner] = useState(false);
  const [loading, setLoading] = useState(true);

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

      // ✅ Fail-closed temprano: mientras resolvemos memberships,
      // el rol por defecto en sesión autenticada es tracker.
      setRole("tracker");

      // Root Owner (informativo para UI admin root)
      try {
        const { data, error } = await supabase.rpc("is_root_owner");
        if (error) setIsRootOwner(false);
        else setIsRootOwner(Boolean(data));
      } catch (_e) {
        setIsRootOwner(false);
      }

      // Profile (solo informativo; NO para role routing)
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("email", user.email)
        .maybeSingle();

      setProfile(prof ?? null);

      // Memberships (FUENTE DE VERDAD)
      const { data: mRowsRaw, error: mErr } = await supabase
        .from("app_user_roles")
        .select("org_id, role, created_at")
        .eq("user_id", user.id);

      if (mErr) {
        console.error("[AuthContext] app_user_roles error (probable RLS):", mErr);
      }

      const mRows = Array.isArray(mRowsRaw) ? [...mRowsRaw] : [];

      mRows.sort((a, b) => {
        const ar = roleRank(a?.role);
        const br = roleRank(b?.role);
        if (ar !== br) return br - ar;
        return new Date(b.created_at) - new Date(a.created_at);
      });

      setMemberships(mRows);

      const orgIds = mRows.map((m) => m.org_id).filter(Boolean);

      // Organizations
      let orgs = [];
      if (orgIds.length) {
        const { data } = await supabase.from("organizations").select("*").in("id", orgIds);
        orgs = data ?? [];
      }
      setOrganizations(orgs);

      // =====================================================
      // Selección de org activa (race-proof)
      // =====================================================
      let activeOrg = null;

      // Si hay force_tracker_org_id, este flujo TIENE prioridad absoluta
      // y bloquea cualquier "owner priority" para evitar leaks al panel.
      const forcedTrackerOrgId = localStorage.getItem("force_tracker_org_id");
      const hasForced = forcedTrackerOrgId && isUuid(forcedTrackerOrgId);

      if (hasForced) {
        // 1) Intento exacto: esa org debe existir y el rol debe ser tracker
        const forcedMembership = mRows.find((m) => m.org_id === forcedTrackerOrgId);
        const forcedRole = String(forcedMembership?.role || "").toLowerCase();
        if (forcedRole === "tracker") {
          activeOrg = orgs.find((o) => o.id === forcedTrackerOrgId) ?? null;
          if (activeOrg) {
            localStorage.setItem("current_org_id", forcedTrackerOrgId);
            // ✅ Solo ahora consumimos el one-shot
            localStorage.removeItem("force_tracker_org_id");
          }
        }

        // 2) Si no existe esa org (o no coincide), pero sí hay alguna membership tracker,
        // elegimos la primera org tracker como fallback seguro.
        if (!activeOrg) {
          const anyTracker = mRows.find(
            (m) => String(m.role || "").toLowerCase() === "tracker" && m.org_id
          );
          if (anyTracker) {
            activeOrg = orgs.find((o) => o.id === anyTracker.org_id) ?? null;
            if (activeOrg) {
              localStorage.setItem("current_org_id", activeOrg.id);
              // ✅ Consumimos el one-shot solo si logramos fijar una org tracker válida
              localStorage.removeItem("force_tracker_org_id");
            }
          }
        }

        // 3) Si aún no hay orgs/memberships suficientes (carrera / RLS),
        // mantenemos fail-closed: no elegimos org owner; dejamos que el próximo reload lo resuelva.
      }

      // Si NO estamos en flujo forzado, aplicamos la lógica normal
      if (!activeOrg && !hasForced) {
        // prioridad owner
        const ownerMembership = mRows.find(
          (m) => String(m.role).toLowerCase() === "owner"
        );
        if (ownerMembership) {
          activeOrg = orgs.find((o) => o.id === ownerMembership.org_id) ?? null;
        }

        // localStorage
        if (!activeOrg) {
          const storedOrgId = localStorage.getItem("current_org_id");
          if (storedOrgId) {
            activeOrg = orgs.find((o) => o.id === storedOrgId) ?? null;
          }
        }

        if (!activeOrg && orgs.length) activeOrg = orgs[0];
      }

      activeOrg = normalizeOrgRow(activeOrg);

      setCurrentOrg(activeOrg);
      setTenantId(activeOrg?.id ?? null);
      setIsSuspended(Boolean(activeOrg?.suspended));

      if (activeOrg?.id) localStorage.setItem("current_org_id", activeOrg.id);
      else localStorage.removeItem("current_org_id");

      // =====================================================
      // ✅ ROL EFECTIVO: SOLO desde memberships. Si no se puede -> tracker.
      // =====================================================
      let resolvedRole = safeRoleFallback();

      if (mRows.length && activeOrg?.id) {
        const activeMembership = mRows.find((m) => m.org_id === activeOrg.id);
        if (activeMembership?.role) {
          resolvedRole = String(activeMembership.role).toLowerCase();
        } else {
          resolvedRole = "tracker";
        }
      } else {
        // Si no hay org aún (carrera), fail-closed tracker
        resolvedRole = "tracker";
      }

      setRole(resolvedRole);

      // ✅ DEBUG útil
      try {
        window.__AUTH__ = {
          email: user?.email,
          user_id: user?.id,
          role: resolvedRole,
          currentOrgId: activeOrg?.id ?? null,
          memberships: mRows,
          hasForcedTrackerOrg: Boolean(hasForced),
        };
      } catch (_) {}
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

  const selectOrg = useCallback(
    (orgId) => {
      const o = organizations.find((x) => x.id === orgId);
      const active = normalizeOrgRow(o) ?? null;

      setCurrentOrg(active);
      setTenantId(active?.id ?? null);
      setIsSuspended(Boolean(active?.suspended));

      if (active?.id) localStorage.setItem("current_org_id", active.id);
      else localStorage.removeItem("current_org_id");

      const m = memberships.find((x) => x.org_id === active?.id);

      // ✅ NUNCA usar profile.role para habilitar panel
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
