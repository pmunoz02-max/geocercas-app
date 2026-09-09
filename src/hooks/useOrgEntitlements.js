// src/hooks/useOrgEntitlements.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient.js";
import { useAuth } from "@/context/auth.js";

const FALLBACK_LIMITS_BY_PLAN = {
  free: {
    max_geocercas: 1,
    max_trackers: 2,
  },
  starter: {
    max_geocercas: 10,
    max_trackers: 3,
  },
  pro: {
    max_geocercas: 25,
    max_trackers: 10,
  },
  enterprise: {
    max_geocercas: 250,
    max_trackers: 50,
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

function normalizePlanStatus(raw) {
  const value = String(raw || "").toLowerCase().trim();

  if (["active", "trialing", "trial", "paid", "current", "approved"].includes(value)) {
    return "active";
  }

  if (["canceled", "cancelled", "expired", "past_due", "inactive"].includes(value)) {
    return "inactive";
  }

  if (["free", ""].includes(value)) {
    return "free";
  }

  return "unknown";
}

function buildFallbackEntitlementsFromPlan(planCode, billingRow = null) {
  const safePlan = normalizePlanCode(planCode);
  const defaults = FALLBACK_LIMITS_BY_PLAN[safePlan] || FALLBACK_LIMITS_BY_PLAN.free;

  const trackerOverride =
    billingRow?.tracker_limit_override == null
      ? defaults.max_trackers
      : normalizeNumber(billingRow.tracker_limit_override, defaults.max_trackers);

  return {
    org_id: billingRow?.org_id || null,
    plan_code: safePlan,
    max_geocercas: defaults.max_geocercas,
    max_trackers: trackerOverride,
    __source: "billing_fallback",
  };
}

function buildTrackerRouteBypassEntitlements(orgId) {
  return {
    ...buildFallbackEntitlementsFromPlan("free", {
      org_id: orgId || null,
      tracker_limit_override: 9999,
    }),
    plan_status: "free",
    __source: "tracker_route_bypass",
    __bypass_reason: "tracker_route_access",
  };
}

export default function useOrgEntitlements() {
  const { ready, authenticated, currentOrgId, currentRole } = useAuth();

  const trackerRouteBypass = useMemo(() => {
    try {
      const p = String(window.location.pathname || "").toLowerCase();
      return (
        p === "/tracker" ||
        p.startsWith("/tracker/") ||
        p === "/tracker-gps" ||
        p.startsWith("/tracker-gps/")
      );
    } catch {
      return false;
    }
  }, []);

  const trackerRoleBypass = String(currentRole || "").toLowerCase() === "tracker";
  const shouldBypassForTracker = trackerRouteBypass;

  const [loading, setLoading] = useState(!shouldBypassForTracker);
  const [error, setError] = useState("");
  const [entitlements, setEntitlements] = useState(null);
  const [source, setSource] = useState("none");
  const bypassLoggedRef = useRef(false);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const loadEntitlements = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrentRequest = () => mountedRef.current && requestId === requestIdRef.current;

    if (shouldBypassForTracker) {
      if (!bypassLoggedRef.current) {
        console.warn("[monetization-regression] source=useOrgEntitlements");
        console.warn("[monetization-regression] tracker route bypass applied");
        bypassLoggedRef.current = true;
      }

      if (!isCurrentRequest()) return;
      setEntitlements(buildTrackerRouteBypassEntitlements(currentOrgId));
      setError("");
      setSource("tracker_route_bypass");
      setLoading(false);
      return;
    }

    // Wait until ready and currentOrgId are both valid before querying billing.
    if (!ready || !authenticated || !currentOrgId) {
      if (!isCurrentRequest()) return;
      setEntitlements(null);
      setError("");
      setSource("none");
      setLoading(true);
      return;
    }

    try {
      if (!isCurrentRequest()) return;
      setLoading(true);
      setError("");

      const [{ data: entitlementRow, error: entitlementError }, { data: billingRow, error: billingError }] =
        await Promise.all([
          supabase.from("org_entitlements").select("*").eq("org_id", currentOrgId).maybeSingle(),
          supabase
            .from("org_billing")
            .select("org_id, plan_code, plan_status, tracker_limit_override, cancel_at_period_end")
            .eq("org_id", currentOrgId)
            .maybeSingle(),
        ]);

      if (!isCurrentRequest()) return;
      if (entitlementError) throw entitlementError;
      if (billingError) throw billingError;

      const currentEntitlementRow =
        entitlementRow && String(entitlementRow.org_id || "") === String(currentOrgId) ? entitlementRow : null;
      const currentBillingRow =
        billingRow && String(billingRow.org_id || "") === String(currentOrgId) ? billingRow : null;

      if (currentEntitlementRow) {
        const effectiveMaxTrackers =
          currentBillingRow?.tracker_limit_override == null
            ? normalizeNumber(currentEntitlementRow.max_trackers, 0)
            : normalizeNumber(currentBillingRow.tracker_limit_override, normalizeNumber(currentEntitlementRow.max_trackers, 0));

        if (!isCurrentRequest()) return;
        setEntitlements({
          ...currentEntitlementRow,
          max_trackers: effectiveMaxTrackers,
          plan_status: currentBillingRow?.plan_status ?? currentEntitlementRow.plan_status ?? null,
          cancel_at_period_end: !!currentBillingRow?.cancel_at_period_end,
          __source: currentBillingRow ? "org_entitlements+org_billing" : "org_entitlements",
        });
        setSource(currentBillingRow ? "org_entitlements+org_billing" : "org_entitlements");
        setLoading(false);
        return;
      }

      if (currentBillingRow) {
        const fallback = buildFallbackEntitlementsFromPlan(currentBillingRow.plan_code, currentBillingRow);

        if (!isCurrentRequest()) return;
        setEntitlements({
          ...fallback,
          plan_status: currentBillingRow.plan_status ?? null,
          cancel_at_period_end: !!currentBillingRow?.cancel_at_period_end,
          __source: "billing_fallback",
        });
        setSource("billing_fallback");
        setLoading(false);
        return;
      }

      const defaultFallback = buildFallbackEntitlementsFromPlan("free", {
        org_id: currentOrgId,
      });

      if (!isCurrentRequest()) return;
      setEntitlements({
        ...defaultFallback,
        plan_status: "free",
        __source: "default_free_fallback",
      });
      setSource("default_free_fallback");
      setError(
        "No se encontró fila en org_entitlements ni org_billing para la organización activa. Se aplicó fallback temporal Free."
      );
      setLoading(false);
    } catch (err) {
      if (!isCurrentRequest()) return;
      const defaultFallback = buildFallbackEntitlementsFromPlan("free", {
        org_id: currentOrgId,
      });

      setEntitlements({
        ...defaultFallback,
        plan_status: "free",
        __source: "error_free_fallback",
      });
      setSource("error_free_fallback");
      setError(err?.message || "No se pudieron cargar los entitlements.");
      setLoading(false);
    }
  }, [ready, authenticated, currentOrgId, currentRole, shouldBypassForTracker, trackerRoleBypass]);

  useEffect(() => {
    requestIdRef.current += 1;
    loadEntitlements();
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadEntitlements]);

  const planCode = useMemo(() => normalizePlanCode(entitlements?.plan_code), [entitlements]);

  const planStatusRaw = entitlements?.plan_status ?? null;
  const normalizedPlanStatus = useMemo(
    () => normalizePlanStatus(planStatusRaw),
    [planStatusRaw]
  );

  const isActive = normalizedPlanStatus === "active";

  const statusLabelKey = useMemo(() => {
    if (normalizedPlanStatus === "active") return "active";
    if (normalizedPlanStatus === "inactive") return "inactive";
    if (normalizedPlanStatus === "free") return "free";
    return "unknown";
  }, [normalizedPlanStatus]);

  const maxGeocercas = useMemo(
    () => normalizeNumber(entitlements?.max_geocercas, 0),
    [entitlements]
  );

  const maxTrackers = useMemo(
    () => normalizeNumber(entitlements?.max_trackers, 0),
    [entitlements]
  );

  const isFree = planCode === "free" || normalizedPlanStatus === "free";
  const isStarter = planCode === "starter" && isActive;
  // Keep PRO enabled while plan_status is active, even if cancellation is scheduled.
  const isPro = planCode === "pro" && isActive;
  const isEnterprise = planCode === "enterprise" && isActive;
  const isElite = planCode === "elite" && isActive;
  const isElitePlus = planCode === "elite_plus" && isActive;

  const canInviteTrackers = useMemo(() => {
    const validSources = new Set([
      "org_entitlements",
      "org_entitlements+org_billing",
      "billing_fallback",
    ]);

    const matchesOrg =
      !!currentOrgId &&
      !!entitlements &&
      String(entitlements.org_id || "") === String(currentOrgId);

    const hasRealEntitlements =
      !loading &&
      !error &&
      !!currentOrgId &&
      !!entitlements &&
      matchesOrg &&
      validSources.has(source);

    const hasPositiveIntegerLimit = Number.isInteger(maxTrackers) && maxTrackers > 0;
    const isAllowedPlanState =
      planCode === "free"
        ? normalizedPlanStatus === "free" || normalizedPlanStatus === "active"
        : normalizedPlanStatus === "active";

    return hasRealEntitlements && hasPositiveIntegerLimit && isAllowedPlanState;
  }, [loading, error, currentOrgId, entitlements, source, maxTrackers, planCode, normalizedPlanStatus]);

  return {
    loading,
    error,
    entitlements,
    source,
    refresh: loadEntitlements,

    orgId: currentOrgId || null,
    planCode,
    planStatusRaw,
    normalizedPlanStatus,
    statusLabelKey,
    isActive,
    maxGeocercas,
    maxTrackers,
    canInviteTrackers,

    isFree,
    isStarter,
    isPro,
    isEnterprise,
    isElite,
    isElitePlus,
  };
}
