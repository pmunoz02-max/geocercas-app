import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext(null);

const safeText = (v) =>
  typeof v === "string" || typeof v === "number" ? String(v) : "";

/**
 * AuthContext — vOrgStable-1
 * - Mantiene login estable
 * - Detecta App Root via RPC is_app_root(p_user_id)
 * - Carga organizations desde memberships (fallback app_user_roles)
 * - Selección de org persistida en localStorage por usuario
 * - Expone API esperada por OrgSelector: organizations, selectOrg, isAdmin, loading
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingOrg, setLoadingOrg] = useState(false);

  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);

  const [isAppRoot, setIsAppRoot] = useState(false);

  function orgStorageKey(uid) {
    return `current_org_id_v1:${uid}`;
  }

  async function loadIsAppRoot(uid) {
    try {
      const cacheKey = `is_app_root_v1:${uid}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const ageMs = Date.now() - (parsed?.ts || 0);
        if (typeof parsed?.val === "boolean" && ageMs < 15 * 60 * 1000) {
          setIsAppRoot(parsed.val);
          return;
        }
      }

      // Parameter name MUST match SQL function signature: is_app_root(p_user_id uuid)
      const { data, error } = await supabase.rpc("is_app_root", {
        p_user_id: uid,
      });
      if (error) throw error;

      const val = !!data;
      setIsAppRoot(val);
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), val }));
    } catch (e) {
      console.warn("[AuthContext] is_app_root error:", e);
      setIsAppRoot(false);
    }
  }

  function normalizeOrgRow(row) {
    const org = row?.organizations ?? null;
    const orgId = row?.org_id ?? org?.id ?? null;
    return {
      id: org?.id ?? orgId,
      name: org?.name ?? null,
      slug: org?.slug ?? null,
      _role: row?.role ?? null,
      _is_default: !!row?.is_default,
    };
  }

  function chooseOrgId(uid, orgs) {
    const stored = safeText(localStorage.getItem(orgStorageKey(uid))).trim();
    if (stored && orgs.some((o) => o.id === stored)) return stored;

    const def = orgs.find((o) => o._is_default && o.id);
    if (def?.id) return def.id;

    const first = orgs.find((o) => o.id);
    return first?.id ?? null;
  }

  async function loadOrganizationsAndRole(uid, preferredOrgId = null) {
    setLoadingOrg(true);
    try {
      // 1) memberships first (new architecture)
      const { data: mems, error: memErr } = await supabase
        .from("memberships")
        .select("org_id, role, is_default, organizations:org_id (id,name,slug)")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });

      if (memErr) console.warn("[AuthContext] memberships error:", memErr);

      let orgs = Array.isArray(mems) ? mems.map(normalizeOrgRow) : [];
      orgs = orgs.filter((o) => !!o.id);

      // 2) fallback: app_user_roles
      if (!orgs.length) {
        const { data: roles, error: roleErr } = await supabase
          .from("app_user_roles")
          .select("org_id, role, organizations:org_id (id,name,slug)")
          .eq("user_id", uid)
          .order("created_at", { ascending: false });

        if (roleErr) console.warn("[AuthContext] app_user_roles error:", roleErr);

        orgs = Array.isArray(roles) ? roles.map(normalizeOrgRow) : [];
        orgs = orgs.filter((o) => !!o.id);
      }

      // Dedup by org id (keep first occurrence which is newest due to ordering)
      const seen = new Set();
      const deduped = [];
      for (const o of orgs) {
        if (!o?.id || seen.has(o.id)) continue;
        seen.add(o.id);
        deduped.push(o);
      }

      setOrganizations(deduped);

      const targetId =
        preferredOrgId && deduped.some((o) => o.id === preferredOrgId)
          ? preferredOrgId
          : chooseOrgId(uid, deduped);

      if (!targetId) {
        setCurrentOrg(null);
        setCurrentRole(null);
        return;
      }

      const picked = deduped.find((o) => o.id === targetId) || null;

      setCurrentOrg(
        picked
          ? { id: picked.id, name: picked.name ?? null, slug: picked.slug ?? null }
          : { id: targetId }
      );
      setCurrentRole(picked?._role ?? null);

      // persist selection
      localStorage.setItem(orgStorageKey(uid), targetId);
    } catch (e) {
      console.warn("[AuthContext] loadOrganizationsAndRole error:", e);
      setOrganizations([]);
      setCurrentOrg(null);
      setCurrentRole(null);
    } finally {
      setLoadingOrg(false);
    }
  }

  async function selectOrg(orgId) {
    const uid = user?.id;
    const id = safeText(orgId).trim();
    if (!uid || !id) return;

    // Persist immediately and update state from already loaded list
    localStorage.setItem(orgStorageKey(uid), id);

    const picked = (Array.isArray(organizations) ? organizations : []).find(
      (o) => o?.id === id
    );

    setCurrentOrg(
      picked ? { id: picked.id, name: picked.name ?? null, slug: picked.slug ?? null } : { id }
    );
    setCurrentRole(picked?._role ?? null);

    // Safety: re-load in case memberships changed
    // (no await to keep UI snappy)
    loadOrganizationsAndRole(uid, id);
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setLoadingAuth(false);

      if (u?.id) {
        loadIsAppRoot(u.id);
        loadOrganizationsAndRole(u.id);
      } else {
        setIsAppRoot(false);
        setOrganizations([]);
        setCurrentOrg(null);
        setCurrentRole(null);
      }
    });

    return () => {
      sub?.subscription?.unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roleLower = String(currentRole || "").toLowerCase().trim();
  const isAdmin = isAppRoot || roleLower === "owner" || roleLower === "admin";

  const value = useMemo(
    () => ({
      // unified loading (Auth + Org)
      loading: loadingAuth || loadingOrg,

      user,

      organizations,
      currentOrg,
      currentRole,

      setCurrentOrg, // keep for backward compat (some pages might set manually)
      setCurrentRole,

      selectOrg,

      isAppRoot,
      isAdmin,

      safeText,
      supabase,
    }),
    [
      loadingAuth,
      loadingOrg,
      user,
      organizations,
      currentOrg,
      currentRole,
      isAppRoot,
      isAdmin,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() debe usarse dentro de <AuthProvider>");
  return ctx;
}
