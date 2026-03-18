// src/hooks/useOrgEntitlements.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient.js";
import { useAuth } from "@/context/auth.js";

const FALLBACK_LIMITS_BY_PLAN = {
  free: {
    max_geocercas: 1,
    max_trackers: 0,
  },
  starter: {
    max_geocercas: 10,
    max_trackers: 1,
  },
  pro: {
    max_geocercas: 9999,
    max_trackers: 3,
  },
  enterprise: {
    max_geocercas: 9999,
    max_trackers: 9999,
  },
  elite: {
    max_geocercas: 9999,
    max_trackers: 9999,
  },
  elite_plus: {
    max_geocercas: 9999,
    max_trackers: 9999,
  },
};

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePlanCode(value) {
  return String(value || "free").toLowerCase().trim();
}

function buildFallbackEntitlementsFromPlan(planCode, billingRow = null) {
  const safePlan = normalizePlanCode(planCode);
  const defaults = FALLBACK_LIMITS_BY_PLAN[safePlan] || FALLBACK_LIMITS_BY_PLAN.free;

  const trackerOverride = normalizeNumber(
    billingRow?.tracker_limit_override,
    defaults.max_trackers
  );

  return {
    org_id: billingRow?.org_id || null,
    plan_code: safePlan,
    max_geocercas: defaults.max_geocercas,
    max_trackers: trackerOverride,
    __source: "billing_fallback",
  };
}

export default function useOrgEntitlements() {
  const { ready, authenticated, currentOrgId, currentRole } = useAuth();

  const trackerRouteBypass = useMemo(() => {
    try {
      const p = String(window.location.pathname || "").toLowerCase();
      return p === "/tracker" || p.startsWith("/tracker/") || p === "/tracker-gps" || p.startsWith("/tracker-gps/");
    } catch {
      return false;
    }
  }, []);

  const trackerRoleBypass = String(currentRole || "").toLowerCase() === "tracker";
  const shouldBypassForTracker = trackerRouteBypass || trackerRoleBypass;

  const [loading, setLoading] = useState(!shouldBypassForTracker);
  const [error, setError] = useState("");
  const [entitlements, setEntitlements] = useState(null);
  const [source, setSource] = useState("none");
  const bypassLoggedRef = useRef(false);

  const loadEntitlements = useCallback(async () => {
    if (shouldBypassForTracker) {
      if (!bypassLoggedRef.current) {
        console.warn("[monetization-regression] source=useOrgEntitlements");
        console.warn("[monetization-regression] tracker bypass applied");
        bypassLoggedRef.current = true;
      }

      setEntitlements(
        buildFallbackEntitlementsFromPlan("pro", {
          org_id: currentOrgId || null,
          tracker_limit_override: 9999,
        })
      );
      setError("");
      setSource("tracker_preview_bypass");
      setLoading(false);
      return;
    }

    if (!ready) return;

    if (!authenticated || !currentOrgId) {
      setEntitlements(null);
      setError("");
      setSource("none");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const { data: entitlementRow, error: entitlementError } = await supabase
        .from("org_entitlements")
        .select("*")
        .eq("org_id", currentOrgId)
        .maybeSingle();

      if (entitlementError) {
        throw entitlementError;
      }

      if (entitlementRow) {
        setEntitlements({
          ...entitlementRow,
          __source: "org_entitlements",
        });
        setSource("org_entitlements");
        return;
      }

      const { data: billingRow, error: billingError } = await supabase
        .from("org_billing")
        .select(
          `
          org_id,
          plan_code,
          plan_status,
          tracker_limit_override
        `
        )
        .eq("org_id", currentOrgId)
        .maybeSingle();

      if (billingError) {
        throw billingError;
      }

      if (billingRow) {
        const fallback = buildFallbackEntitlementsFromPlan(
          billingRow.plan_code,
          billingRow
        );

        setEntitlements(fallback);
        setSource("billing_fallback");
        return;
      }

      const defaultFallback = buildFallbackEntitlementsFromPlan("free", {
        org_id: currentOrgId,
      });

      setEntitlements(defaultFallback);
      setSource("default_free_fallback");
      setError(
        "No se encontró fila en org_entitlements ni org_billing. Se aplicó fallback temporal Free."
      );
    } catch (err) {
      const defaultFallback = buildFallbackEntitlementsFromPlan("free", {
        org_id: currentOrgId,
      });

      setEntitlements(defaultFallback);
      setSource("error_free_fallback");
      setError(err?.message || "No se pudieron cargar los entitlements.");
    } finally {
      setLoading(false);
    }
  }, [ready, authenticated, currentOrgId, shouldBypassForTracker]);

  useEffect(() => {
    loadEntitlements();
  }, [loadEntitlements]);

  const planCode = useMemo(() => {
    return normalizePlanCode(entitlements?.plan_code);
  }, [entitlements]);

  const maxGeocercas = useMemo(() => {
    return normalizeNumber(entitlements?.max_geocercas, 0);
  }, [entitlements]);

  const maxTrackers = useMemo(() => {
    return normalizeNumber(entitlements?.max_trackers, 0);
  }, [entitlements]);

  const isFree = planCode === "free";
  const isStarter = planCode === "starter";
  const isPro = planCode === "pro";
  const isEnterprise = planCode === "enterprise";
  const isElite = planCode === "elite";
  const isElitePlus = planCode === "elite_plus";

  return {
    loading,
    error,
    entitlements,
    source,
    refresh: loadEntitlements,

    orgId: currentOrgId || null,
    planCode,
    maxGeocercas,
    maxTrackers,

    isFree,
    isStarter,
    isPro,
    isEnterprise,
    isElite,
    isElitePlus,
  };
}