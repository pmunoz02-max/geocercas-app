// src/hooks/useOrgEntitlements.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient.js";
import { useAuth } from "@/context/auth.js";

const FALLBACK_LIMITS_BY_PLAN = {
  free: {
    max_geocercas: 5,
    max_trackers: 1,
  },
  starter: {
    max_geocercas: 10,
    max_trackers: 3,
  },
  pro: {
    max_geocercas: 200,
    max_trackers: 50,
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
      setEntitlements({
        ...buildFallbackEntitlementsFromPlan("pro", {
          org_id: currentOrgId || null,
          tracker_limit_override: 9999,
        }),
        plan_status: "active",
      });
      setError("");
      setSource("tracker_preview_bypass");
      setLoading(false);
      return;
    }

    // Wait until ready and currentOrgId are both valid before querying billing
    if (!ready || !authenticated || !currentOrgId) {
      setEntitlements(null);
      setError("");
      setSource("none");
      setLoading(true);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const [{ data: entitlementRow, error: entitlementError }, { data: billingRow, error: billingError }] =
        await Promise.all([
          supabase.from("org_entitlements").select("*").eq("org_id", currentOrgId).maybeSingle(),
          supabase
            .from("org_billing")
            .select("org_id, plan_code, plan_status, tracker_limit_override")
            .eq("org_id", currentOrgId)
            .maybeSingle(),
        ]);

      if (entitlementError) throw entitlementError;
      if (billingError) throw billingError;

      if (entitlementRow) {
        setEntitlements({
          ...entitlementRow,
          plan_status: billingRow?.plan_status ?? null,
          __source: billingRow ? "org_entitlements+org_billing" : "org_entitlements",
        });
        setSource(billingRow ? "org_entitlements+org_billing" : "org_entitlements");
        setLoading(false);
        return;
      }

      if (billingRow) {
        const fallback = buildFallbackEntitlementsFromPlan(billingRow.plan_code, billingRow);

        setEntitlements({
          ...fallback,
          plan_status: billingRow.plan_status ?? null,
          __source: "billing_fallback",
        });
        setSource("billing_fallback");
        setLoading(false);
        return;
      }

      const defaultFallback = buildFallbackEntitlementsFromPlan("free", {
        org_id: currentOrgId,
      });

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
  }, [ready, authenticated, currentOrgId, shouldBypassForTracker]);

  useEffect(() => {
    loadEntitlements();
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
  const isPro = planCode === "pro" && isActive;
  const isEnterprise = planCode === "enterprise" && isActive;
  const isElite = planCode === "elite" && isActive;
  const isElitePlus = planCode === "elite_plus" && isActive;

  const canInviteTrackers = useMemo(() => {
    return isActive && maxTrackers > 1;
  }, [isActive, maxTrackers]);

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