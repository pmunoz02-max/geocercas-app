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

async function safeSelect(table, queryFn) {
  try {
    const res = await queryFn(supabase.from(table));
    if (res?.error) return { ok: false, error: res.error, data: null };
    return { ok: true, error: null, data: res?.data ?? null };
  } catch (e) {
    return { ok: false, error: e, data: null };
  }
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

  // -------------------------------------------------
  // SESSION
  // -------------------------------------------------
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data?.session ?? null);
      setUser(data?.session?.user ?? null);
    };

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  // -------------------------------------------------
  // LOAD PROFILE + MEMBERSHIPS + ORGS + ROLE (UNIVERSAL)
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
          return;
        }
        setProfile(prof);

        // 2) Intentar membership "canónica" desde view v_current_membership (si existe)
        //    Esperamos: { org_id, role, org_name? }
        const vCurrent = await safeSelect("v_current_membership", (q) =>
          q.select("*").maybeSingle()
        );

        let mRows = [];
        let activeOrg = null;

        if (vCurrent.ok && vCurrent.data?.org_id) {
          const row = vCurrent.data;
          const resolvedRole = row.role || prof.role || "tracker";

          mRows = [
            {
              org_id: row.org_id,
              role: resolvedRole,
              is_default: true,
              created_at: row.created_at || null,
            },
          ];

          activeOrg = {
            id: row.org_id,
            name: row.org_name || row.name || "Organización",
          };
        } else {
          // 3) Fallback clásico: memberships (por profiles.id)
          const mRes = await supabase
            .from("memberships")
            .select("org_id, role, created_at, is_default")
            .eq("user_id", prof.id);

          if (mRes.error) console.error("[AuthContext] Error loading memberships:", mRes.error);

          mRows = (mRes.data || []).slice();

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

          // 4) Cargar organizaciones de forma robusta:
          //    - Preferir my_org_ids (view) si existe.
          //    - Luego organizations_readable si existe.
          //    - Luego organizations (fallback).
          let orgIds = mRows.map((m) => m.org_id).filter(Boolean);

          // Si no hay orgIds por memberships, intentar my_org_ids (universal)
          if (orgIds.length === 0) {
            const myOrgIds = await safeSelect("my_org_ids", (q) => q.select("*"));
            if (myOrgIds.ok && Array.isArray(myOrgIds.data) && myOrgIds.data.length > 0) {
              orgIds = myOrgIds.data
                .map((r) => r.org_id ?? r.id ?? r.tenant_id)
                .filter(Boolean);
            }
          }

          let orgs = [];

          if (orgIds.length > 0) {
            // organizations_readable primero
            const orgReadable = await safeSelect("organizations_readable", (q) =>
              q.select("*").in("id", orgIds)
            );

            if (orgReadable.ok) {
              orgs = orgReadable.data || [];
            } else {
              // fallback organizations
              const orgClassic = await safeSelect("organizations", (q) =>
                q.select("*").in("id", orgIds)
              );
              if (orgClassic.ok) orgs = orgClassic.data || [];
            }
          }

          // Current org: default membership si existe, si no primera org
          if (mRows.length > 0 && orgs.length > 0) {
            const def = mRows.find((m) => m.is_default);
            activeOrg = orgs.find((o) => o.id === def?.org_id) || orgs[0];
          } else {
            activeOrg = null;
          }

          setOrganizations(orgs);
        }

        setMemberships(mRows);

        setCurrentOrg(activeOrg);
        setTenantId(activeOrg?.id ?? null);

        // 5) ROLE canónico
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
        console.error("[AuthContext] fatal error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [user]);

  const isOwner = role === "owner";
  const isAdmin = role === "admin" || role === "owner";
  const currentRole = role; // compat

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
