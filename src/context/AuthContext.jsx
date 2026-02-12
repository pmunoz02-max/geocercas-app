// src/context/AuthContext.jsx
<<<<<<< HEAD
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
=======
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useState,
  useRef,
} from "react";

/**
 * AuthContext UNIVERSAL (TWA/WebView safe)
 * Fuente: /api/auth/session (cookie HttpOnly tg_at)
 */
>>>>>>> preview

const AuthContext = createContext(null);

function withTimeout(promise, ms, label = "timeout") {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

// --------------------------------------------------
// ORG STORAGE (compatibilidad universal)
// - Fuente de verdad: backend (get_my_context / set_current_org)
// - Storage: solo cache + compat para módulos legacy (tg_current_org_id, tenant_id, org_id)
// --------------------------------------------------
function persistActiveOrgToStorage(orgId) {
  try {
    if (orgId && String(orgId).trim()) {
      const v = String(orgId).trim();

      // canónica del proyecto (ya existe en tu app)
      localStorage.setItem("app_geocercas_last_org_id", v);

      // compat legacy (varios módulos)
      localStorage.setItem("org_id", v);
      localStorage.setItem("tenant_id", v);

      // compat específica actividades (actual)
      localStorage.setItem("tg_current_org_id", v);
    }
  } catch {
    // ignore
  }
}

function clearActiveOrgFromStorage() {
  try {
    localStorage.removeItem("app_geocercas_last_org_id");
    localStorage.removeItem("org_id");
    localStorage.removeItem("tenant_id");
    localStorage.removeItem("tg_current_org_id");
  } catch {
    // ignore
  }
}

function normalizeRole(v) {
  if (!v) return null;
  return String(v).trim().toLowerCase();
}

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [contextLoading, setContextLoading] = useState(false);

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

<<<<<<< HEAD
  const [ctx, setCtx] = useState(null);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [role, setRole] = useState(null);

=======
  const [currentRole, setCurrentRole] = useState(null);
>>>>>>> preview
  const [isAppRoot, setIsAppRoot] = useState(false);

  const mountedRef = useRef(true);

<<<<<<< HEAD
  // -----------------------------
  // Single-flight + cache (universal)
  // -----------------------------
  const ctxInFlightRef = useRef(null);
  const ctxLastRef = useRef({ userId: null, at: 0, data: null });

  const rootInFlightRef = useRef(null);
  const rootLastRef = useRef({ userId: null, at: 0, ok: false });
=======
  const role = currentRole;
  const currentOrgId = currentOrg?.id || null;
  const orgId = currentOrgId;

  const authenticated = Boolean(user);
  const [ready, setReady] = useState(false);
  const didBootstrapOnceRef = useRef(false);
>>>>>>> preview

  // TTLs
  const CTX_TTL_MS = 10_000;
  const ROOT_TTL_MS = 60_000;

<<<<<<< HEAD
  // --------------------------------------------------
  // ROOT OWNER CHECK
  // --------------------------------------------------
  const fetchIsAppRoot = async (u, { force = false } = {}) => {
    const uid = u?.id;
    if (!uid || !mountedRef.current) {
      setIsAppRoot(false);
      return false;
=======
      try {
        localStorage.setItem(LS_ORG_KEY, orgIdToSelect);
      } catch {}

      setCurrentOrg((prev) => {
        if (prev?.id === orgIdToSelect) return prev;
        const found = Array.isArray(organizations)
          ? organizations.find((o) => o?.id === orgIdToSelect)
          : null;
        return found || { id: orgIdToSelect };
      });

      setOrganizations((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        if (arr.some((o) => o?.id === orgIdToSelect)) return arr;
        return [{ id: orgIdToSelect }, ...arr];
      });
    },
    [organizations]
  );

  const bootstrap = useCallback(async () => {
    setLoading(true);

    try {
      const { ok, data } = await fetchSession();

      if (!ok || !data || data.authenticated !== true) {
        setUser(null);
        setCurrentRole(null);
        setIsAppRoot(false);
        setOrganizations([]);
        setCurrentOrg(null);
        return;
      }

      setUser(data.user ?? null);
      setIsAppRoot(Boolean(data.is_app_root ?? data.isAppRoot ?? false));

      const serverOrgId =
        data.current_org_id ??
        data.currentOrgId ??
        data.current_orgId ??
        data.org_id ??
        data.orgId ??
        null;

      const orgsFromServer = Array.isArray(data.organizations)
        ? data.organizations
        : Array.isArray(data.orgs)
        ? data.orgs
        : null;

      let preferredOrgId = null;
      try {
        preferredOrgId = localStorage.getItem(LS_ORG_KEY);
      } catch {}

      const finalOrgId = preferredOrgId || serverOrgId || null;

      if (orgsFromServer && orgsFromServer.length > 0) {
        const normalized = orgsFromServer
          .map((o) => {
            const id = o?.id ?? o?.org_id ?? null;
            if (!id) return null;
            return {
              ...o,
              id,
              name: o?.name ?? o?.org_name ?? o?.title ?? "",
              role: normalizeRole(o?.role ?? o?.currentRole ?? o?.app_role),
            };
          })
          .filter(Boolean);

        setOrganizations(normalized);

        const pickedId =
          (finalOrgId && normalized.find((o) => o?.id === finalOrgId)?.id) ||
          normalized.find((o) => o?.id)?.id ||
          null;

        const orgObj = pickedId ? normalized.find((o) => o?.id === pickedId) : null;
        setCurrentOrg(orgObj || null);

        if (pickedId) {
          try {
            localStorage.setItem(LS_ORG_KEY, pickedId);
          } catch {}
        }

        const resolvedRole =
          normalizeRole(
            data.currentRole ??
              data.current_role ??
              data.role ??
              data.app_role ??
              null
          ) || normalizeRole(orgObj?.role);

        setCurrentRole(resolvedRole);
      } else {
        if (finalOrgId) {
          setOrganizations([{ id: finalOrgId }]);
          setCurrentOrg({ id: finalOrgId });
          try {
            localStorage.setItem(LS_ORG_KEY, finalOrgId);
          } catch {}
        } else {
          setOrganizations([]);
          setCurrentOrg(null);
        }

        const resolvedRole = normalizeRole(
          data.currentRole ?? data.current_role ?? data.role ?? data.app_role ?? null
        );
        setCurrentRole(resolvedRole);
      }
    } finally {
      setLoading(false);
      if (!didBootstrapOnceRef.current) {
        didBootstrapOnceRef.current = true;
        setReady(true);
      }
>>>>>>> preview
    }

    const now = Date.now();
    const last = rootLastRef.current;

    if (!force && last.userId === uid && now - last.at < ROOT_TTL_MS) {
      if (mountedRef.current) setIsAppRoot(!!last.ok);
      return !!last.ok;
    }

    if (!force && rootInFlightRef.current) {
      return rootInFlightRef.current;
    }

    const p = (async () => {
      try {
        const { data } = await withTimeout(
          supabase
            .from("app_root_owners")
            .select("user_id, active")
            .eq("user_id", uid)
            .maybeSingle(),
          6000,
          "root_check_timeout"
        );

        const ok = !!(data && data.user_id && data.active === true);
        rootLastRef.current = { userId: uid, at: Date.now(), ok };

        if (mountedRef.current) setIsAppRoot(ok);
        return ok;
      } catch {
        rootLastRef.current = { userId: uid, at: Date.now(), ok: false };
        if (mountedRef.current) setIsAppRoot(false);
        return false;
      } finally {
        rootInFlightRef.current = null;
      }
    })();

    rootInFlightRef.current = p;
    return p;
  };

  // --------------------------------------------------
  // CONTEXT (ORG + ROLE) — FUENTE DE VERDAD = BACKEND
  // --------------------------------------------------
  const applyCtx = (data) => {
    setCtx(data || null);

    if (data?.ok && data.org_id) {
      const orgId = data.org_id;

      setCurrentOrg({
        id: orgId,
        name: data.org_name || null,
      });
      setRole(data.role || null);

      // ✅ Universal: sincroniza org activa para módulos legacy (incluye Actividades)
      persistActiveOrgToStorage(orgId);
    } else {
      setCurrentOrg(null);
      setRole(null);
      clearActiveOrgFromStorage();
    }
  };

  const fetchContext = async ({ force = false } = {}) => {
    if (!mountedRef.current) return null;

    const { data: sessData } = await supabase.auth.getSession();
    const sess = sessData?.session || null;

    if (!sess?.user?.id) {
      ctxLastRef.current = { userId: null, at: Date.now(), data: null };
      applyCtx(null);
      return null;
    }

    const uid = sess.user.id;
    const now = Date.now();
    const last = ctxLastRef.current;

    if (!force && last.userId === uid && now - last.at < CTX_TTL_MS && last.data) {
      applyCtx(last.data);
      return last.data;
    }

    if (!force && ctxInFlightRef.current) {
      return ctxInFlightRef.current;
    }

    setContextLoading(true);

    const p = (async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.rpc("get_my_context"),
          8000,
          "rpc_timeout_get_my_context"
        );

        if (!mountedRef.current) return null;

        if (error) {
          const bad = { ok: false, error: error.message || "rpc_error" };
          ctxLastRef.current = { userId: uid, at: Date.now(), data: bad };
          applyCtx(bad);
          return bad;
        }

        ctxLastRef.current = { userId: uid, at: Date.now(), data };
        applyCtx(data);
        return data;
      } catch (e) {
        if (!mountedRef.current) return null;
        const bad = { ok: false, error: e?.message || "rpc_exception" };
        ctxLastRef.current = { userId: uid, at: Date.now(), data: bad };
        applyCtx(bad);
        return bad;
      } finally {
        if (mountedRef.current) setContextLoading(false);
        ctxInFlightRef.current = null;
      }
    })();

    ctxInFlightRef.current = p;
    return p;
  };

  // --------------------------------------------------
  // CAMBIAR ORG ACTIVA
  // --------------------------------------------------
  const switchOrg = async (orgId) => {
    if (!orgId) return { ok: false, error: "org_required" };

    const { data, error } = await supabase.rpc("set_current_org", { p_org: orgId });
    if (error) return { ok: false, error: error.message };

    // refrescar contexto (fuente de verdad)
    await fetchContext({ force: true });
    return data;
  };

  // --------------------------------------------------
  // BOOTSTRAP
  // --------------------------------------------------
  useEffect(() => {
    mountedRef.current = true;

    const boot = async () => {
      setLoading(true);
      try {
        const { data } = await withTimeout(supabase.auth.getSession(), 6000, "getSession_timeout");

        if (!mountedRef.current) return;

        const sess = data?.session ?? null;
        setSession(sess);
        setUser(sess?.user ?? null);

        if (sess?.user) {
          fetchIsAppRoot(sess.user);
          fetchContext();
        } else {
          applyCtx(null);
          setIsAppRoot(false);
        }
      } catch {
        if (!mountedRef.current) return;
        setSession(null);
        setUser(null);
        setIsAppRoot(false);
        applyCtx(null);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    boot();

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mountedRef.current) return;

      if (event === "INITIAL_SESSION") return;

      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        fetchIsAppRoot(newSession.user, { force: true });
        fetchContext({ force: true });
      } else {
        setIsAppRoot(false);
        applyCtx(null);
      }
    });

    return () => {
      mountedRef.current = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // --------------------------------------------------
  // API CONTEXT
  // --------------------------------------------------
  const value = useMemo(
    () => ({
      loading,
<<<<<<< HEAD
      contextLoading,
      session,
      user,
      ctx,
      currentOrg,
=======
      ready,
      authenticated,
      user,
      isLoggedIn: Boolean(user),

      currentRole,
      isAppRoot,
      organizations,
      currentOrg,
      selectOrg,

>>>>>>> preview
      role,
      currentRole: role,
      isAppRoot,
      refreshContext: (opts) => fetchContext(opts),
      switchOrg,
      signOut: async () => {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setCtx(null);
        setCurrentOrg(null);
        setRole(null);
        setIsAppRoot(false);

<<<<<<< HEAD
        clearActiveOrgFromStorage();

        // limpia cache local
        ctxInFlightRef.current = null;
        rootInFlightRef.current = null;
        ctxLastRef.current = { userId: null, at: Date.now(), data: null };
        rootLastRef.current = { userId: null, at: Date.now(), ok: false };
      },
      isAuthenticated: !!session,
=======
      refreshSession: bootstrap,
      logout,
>>>>>>> preview
    }),
    [loading, contextLoading, session, user, ctx, currentOrg, role, isAppRoot]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** ✅ Hook estricto (para detectar bugs en dev) */
export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth debe usarse dentro de <AuthProvider />");
  return v;
}

/** ✅ Hook seguro (NO tumba la app si el Provider no está montado) */
export function useAuthSafe() {
  return useContext(AuthContext);
}
