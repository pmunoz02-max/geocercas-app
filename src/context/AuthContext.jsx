// src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabaseClient";

/**
 * AuthContext (panel-first, tracker-safe)
 * - NO se cuelga si falla memberships/roles (authReady siempre termina en true)
 * - NO requiere env vars tracker a menos que el hostname sea tracker.*
 * - currentRole viene normalizado y estable (owner/admin/viewer/tracker)
 *
 * Expone:
 * - authReady
 * - session, user
 * - roles (rows)
 * - bestRole (string)
 * - currentRole (string)  <-- alias estable para UI/guards
 * - orgs (panel)
 * - currentOrg + setCurrentOrg
 * - trackerDomain (bool)
 */

const AuthContext = createContext(null);

function isTrackerHostname(hostname) {
  const h = String(hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

function normalizeRole(r) {
  const s = String(r || "").toLowerCase().trim();
  if (["owner", "admin", "viewer", "tracker"].includes(s)) return s;
  return null;
}

function roleRank(r) {
  if (r === "owner") return 3;
  if (r === "admin") return 2;
  if (r === "viewer") return 1;
  if (r === "tracker") return 0;
  return -1;
}

function computeBestRole(rows) {
  let best = null;
  for (const row of rows || []) {
    const rr = normalizeRole(row?.role);
    if (!rr) continue;
    if (!best || roleRank(rr) > roleRank(best)) best = rr;
  }
  return best;
}

export function AuthProvider({ children }) {
  const trackerDomain = useMemo(() => isTrackerHostname(window.location.hostname), []);
  const [authReady, setAuthReady] = useState(false);

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [roles, setRoles] = useState([]);
  const [bestRole, setBestRole] = useState(null);

  const [orgs, setOrgs] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);

  // ---- Carga roles desde el PROYECTO PANEL (única fuente de verdad)
  const loadRoles = async (userId) => {
    if (!userId) return [];

    // Ajusta el nombre de tabla/vista si en tu DB se llama distinto.
    // En tu app venías usando algo tipo app_user_roles.
    const { data, error } = await supabase
      .from("app_user_roles")
      .select("org_id, role, created_at")
      .eq("user_id", userId);

    if (error) {
      console.warn("[AuthContext] memberships/roles error:", error);
      return [];
    }
    return data || [];
  };

  // ---- Carga organizaciones SOLO si aplica (no trackerDomain y role no tracker)
  const loadOrgsByIds = async (orgIds) => {
    const ids = Array.from(new Set((orgIds || []).filter(Boolean)));
    if (!ids.length) return [];

    // Ajusta fields si tu tabla se llama distinto o no tiene "name"
    const { data, error } = await supabase.from("organizations").select("id, name, active, created_at").in("id", ids);

    if (error) {
      console.warn("[AuthContext] orgs error:", error);
      return [];
    }
    return data || [];
  };

  const resolveCurrentOrg = (rolesRows, orgRows, best) => {
    if (!Array.isArray(orgRows) || orgRows.length === 0) return null;
    if (best === "tracker") return null;

    // prioriza org_id asociado al "bestRole"
    const bestRows = (rolesRows || [])
      .map((r) => ({ ...r, role: normalizeRole(r?.role) }))
      .filter((r) => r.role === best && r.org_id);

    if (bestRows.length) {
      // el más reciente primero
      bestRows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      const orgId = bestRows[0].org_id;
      const found = orgRows.find((o) => o.id === orgId);
      if (found) return found;
    }

    // fallback: primera org
    return orgRows[0] || null;
  };

  // ---- Bootstrap + listener
  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setAuthReady(false);

      try {
        const { data } = await supabase.auth.getSession();
        const sess = data?.session ?? null;

        if (!mounted) return;

        setSession(sess);
        setUser(sess?.user ?? null);

        if (!sess?.user?.id) {
          // no logueado
          setRoles([]);
          setBestRole(null);
          setOrgs([]);
          setCurrentOrg(null);
          return;
        }

        // 1) roles
        const rolesRows = await loadRoles(sess.user.id);
        if (!mounted) return;

        setRoles(rolesRows);
        const best = computeBestRole(rolesRows) || normalizeRole(sess.user.user_metadata?.role) || null;
        setBestRole(best);

        // 2) orgs (solo si NO es trackerDomain y bestRole != tracker)
        if (!trackerDomain && best !== "tracker") {
          const orgIds = rolesRows.map((r) => r.org_id).filter(Boolean);
          const orgRows = await loadOrgsByIds(orgIds);
          if (!mounted) return;

          setOrgs(orgRows);
          const resolved = resolveCurrentOrg(rolesRows, orgRows, best);
          setCurrentOrg(resolved);
        } else {
          setOrgs([]);
          setCurrentOrg(null);
        }
      } catch (e) {
        console.error("[AuthContext] bootstrap error:", e);

        // IMPORTANTÍSIMO: NO bloquear UI
        setSession(null);
        setUser(null);
        setRoles([]);
        setBestRole(null);
        setOrgs([]);
        setCurrentOrg(null);
      } finally {
        if (mounted) setAuthReady(true);
      }
    };

    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;

      setAuthReady(false);
      try {
        setSession(newSession ?? null);
        setUser(newSession?.user ?? null);

        if (!newSession?.user?.id) {
          setRoles([]);
          setBestRole(null);
          setOrgs([]);
          setCurrentOrg(null);
          return;
        }

        const rolesRows = await loadRoles(newSession.user.id);
        if (!mounted) return;

        setRoles(rolesRows);
        const best = computeBestRole(rolesRows) || normalizeRole(newSession.user.user_metadata?.role) || null;
        setBestRole(best);

        if (!trackerDomain && best !== "tracker") {
          const orgIds = rolesRows.map((r) => r.org_id).filter(Boolean);
          const orgRows = await loadOrgsByIds(orgIds);
          if (!mounted) return;

          setOrgs(orgRows);
          const resolved = resolveCurrentOrg(rolesRows, orgRows, best);
          setCurrentOrg(resolved);
        } else {
          setOrgs([]);
          setCurrentOrg(null);
        }
      } catch (e) {
        console.error("[AuthContext] onAuthStateChange error:", e);
      } finally {
        if (mounted) setAuthReady(true);
      }
    });

    return () => {
      mounted = false;
      try {
        sub?.subscription?.unsubscribe?.();
      } catch {}
    };
  }, [trackerDomain]);

  // currentRole: nombre estable para UI/guards
  const currentRole = useMemo(() => bestRole || null, [bestRole]);

  const value = useMemo(
    () => ({
      authReady,
      session,
      user,

      roles,
      bestRole,
      currentRole,

      orgs,
      currentOrg,
      setCurrentOrg,

      trackerDomain,
    }),
    [authReady, session, user, roles, bestRole, currentRole, orgs, currentOrg, trackerDomain]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
