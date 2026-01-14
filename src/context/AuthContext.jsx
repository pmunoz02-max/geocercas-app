// src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase, getMemoryAccessToken, clearMemoryAccessToken } from "../supabaseClient";

const AuthContext = createContext(null);

const safeText = (v) =>
  typeof v === "string" || typeof v === "number" ? String(v) : "";

/**
 * AuthContext — POSTLOGIN-V1 (WebView/TWA + Web)
 * Fuente de verdad:
 * 1) Web normal: supabase.auth.getSession()
 * 2) WebView/TWA (LOGIN-V29): token en memoria -> supabase.auth.getUser(token)
 *
 * - NO depende de setSession()
 * - Evita loader infinito
 * - Carga organizations desde memberships (fallback app_user_roles)
 * - Selección de org persistida en localStorage por usuario
 * - Expone: loading, user, organizations, currentOrg, currentRole, selectOrg, isAppRoot, isAdmin
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

      const { data, error } = await supabase.rpc("is_app_root", { p_user_id: uid });
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
      // 1) memberships first
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

      // Dedup by org id
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

    // Re-load to stay consistent with backend changes
    loadOrganizationsAndRole(uid, id);
  }

  function resetAuthState() {
    setUser(null);
    setIsAppRoot(false);
    setOrganizations([]);
    setCurrentOrg(null);
    setCurrentRole(null);
  }

  // ✅ POSTLOGIN: init robusto (sesión supabase o token en memoria)
  useEffect(() => {
    let cancelled = false;

    async function hydrateFromUser(u) {
      setUser(u);
      if (u?.id) {
        loadIsAppRoot(u.id);
        await loadOrganizationsAndRole(u.id);
      } else {
        resetAuthState();
      }
    }

    async function init() {
      try {
        // 1) Web normal (si existe)
        const { data, error } = await supabase.auth.getSession();
        if (error) console.warn("[AuthContext] getSession error:", error);

        const sessionUser = data?.session?.user ?? null;
        if (cancelled) return;

        if (sessionUser?.id) {
          await hydrateFromUser(sessionUser);
          return;
        }

        // 2) WebView/TWA (LOGIN-V29): token en memoria
        const memToken = getMemoryAccessToken?.();
        if (!memToken) {
          resetAuthState();
          return;
        }

        const { data: udata, error: uerr } = await supabase.auth.getUser(memToken);
        if (cancelled) return;

        if (uerr) {
          console.warn("[AuthContext] getUser(token) error:", uerr);
          clearMemoryAccessToken?.();
          resetAuthState();
          return;
        }

        const memUser = udata?.user ?? null;
        if (!memUser?.id) {
          clearMemoryAccessToken?.();
          resetAuthState();
          return;
        }

        await hydrateFromUser(memUser);
      } catch (e) {
        console.warn("[AuthContext] init error:", e);
        // Si falla algo raro, evita loader infinito
        resetAuthState();
      } finally {
        if (!cancelled) setLoadingAuth(false);
      }
    }

    init();

    // Suscripción secundaria (útil en web normal / logout explícito)
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        const u = session?.user ?? null;

        if (!u?.id) {
          // Si supabase dice signed-out, limpiamos estado y token memoria
          clearMemoryAccessToken?.();
          resetAuthState();
          setLoadingAuth(false);
          return;
        }

        setLoadingAuth(false);
        await hydrateFromUser(u);
      } catch (e) {
        console.warn("[AuthContext] onAuthStateChange error:", e);
        setLoadingAuth(false);
      }
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
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

      setCurrentOrg, // backward compat
      setCurrentRole,

      selectOrg,

      isAppRoot,
      isAdmin,

      safeText,
      supabase,
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
