// src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase, setMemoryAccessToken, clearMemoryAccessToken } from "../supabaseClient";

const AuthContext = createContext(null);

const safeText = (v) =>
  typeof v === "string" || typeof v === "number" ? String(v) : "";

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

  async function loadIsAppRoot(uid) {
    try {
      const { data, error } = await supabase.rpc("is_app_root", { p_user_id: uid });
      if (error) throw error;
      setIsAppRoot(!!data);
    } catch {
      setIsAppRoot(false);
    }
  }

  async function loadOrganizationsAndRole(uid, preferredOrgId = null) {
    setLoadingOrg(true);
    try {
      const { data: mems } = await supabase
        .from("memberships")
        .select("org_id, role, is_default, organizations:org_id (id,name,slug)")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });

      let orgs = Array.isArray(mems) ? mems.map(normalizeOrgRow) : [];
      orgs = orgs.filter((o) => !!o.id);

      if (!orgs.length) {
        const { data: roles } = await supabase
          .from("app_user_roles")
          .select("org_id, role, organizations:org_id (id,name,slug)")
          .eq("user_id", uid)
          .order("created_at", { ascending: false });

        orgs = Array.isArray(roles) ? roles.map(normalizeOrgRow) : [];
        orgs = orgs.filter((o) => !!o.id);
      }

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

    localStorage.setItem(orgStorageKey(uid), id);

    const picked = (Array.isArray(organizations) ? organizations : []).find((o) => o?.id === id);

    setCurrentOrg(
      picked
        ? { id: picked.id, name: picked.name ?? null, slug: picked.slug ?? null }
        : { id }
    );
    setCurrentRole(picked?._role ?? null);

    loadOrganizationsAndRole(uid, id);
  }

  function resetAll() {
    clearMemoryAccessToken?.();
    setUser(null);
    setOrganizations([]);
    setCurrentOrg(null);
    setCurrentRole(null);
    setIsAppRoot(false);
  }

  // ✅ INIT: cookie session (same-origin) -> memory token -> cargar orgs
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const r = await fetch("/api/auth/session", {
          method: "GET",
          headers: { "Cache-Control": "no-store" },
        });
        const j = await r.json();

        if (cancelled) return;

        if (!j?.authenticated || !j?.access_token || !j?.user?.id) {
          resetAll();
          return;
        }

        // 🔐 pasa token a memoria para supabase-js (RLS)
        setMemoryAccessToken(j.access_token);

        setUser({ id: j.user.id, email: j.user.email || null });

        loadIsAppRoot(j.user.id);
        await loadOrganizationsAndRole(j.user.id);
      } catch (e) {
        console.warn("[AuthContext] init session error:", e);
        resetAll();
      } finally {
        if (!cancelled) setLoadingAuth(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const roleLower = String(currentRole || "").toLowerCase().trim();
  const isAdmin = isAppRoot || roleLower === "owner" || roleLower === "admin";

  const value = useMemo(
    () => ({
      loading: loadingAuth || loadingOrg,
      user,
      organizations,
      currentOrg,
      currentRole,
      selectOrg,
      isAppRoot,
      isAdmin,
      supabase,
      safeText,
    }),
    [loadingAuth, loadingOrg, user, organizations, currentOrg, currentRole, isAppRoot, isAdmin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() debe usarse dentro de <AuthProvider>");
  return ctx;
}
