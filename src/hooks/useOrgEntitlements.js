// src/hooks/useOrgEntitlements.js
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient.js";
import { useAuth } from "@/context/auth.js";

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePlanCode(value) {
  return String(value || "free").toLowerCase();
}

export default function useOrgEntitlements() {
  const { ready, authenticated, currentOrgId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [entitlements, setEntitlements] = useState(null);

  const loadEntitlements = useCallback(async () => {
    if (!ready) {
      return;
    }

    if (!authenticated || !currentOrgId) {
      setEntitlements(null);
      setError("");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const { data, error: dbError } = await supabase
        .from("org_entitlements")
        .select("*")
        .eq("org_id", currentOrgId)
        .maybeSingle();

      if (dbError) throw dbError;

      setEntitlements(data || null);
    } catch (err) {
      setEntitlements(null);
      setError(err?.message || "No se pudieron cargar los entitlements.");
    } finally {
      setLoading(false);
    }
  }, [ready, authenticated, currentOrgId]);

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
  const isPro = planCode === "pro";
  const isEnterprise = planCode === "enterprise";
  const isElite = planCode === "elite";
  const isElitePlus = planCode === "elite_plus";
  const isStarter = planCode === "starter";

  return {
    loading,
    error,
    entitlements,
    refresh: loadEntitlements,

    orgId: currentOrgId || null,
    planCode,
    maxGeocercas,
    maxTrackers,

    isFree,
    isPro,
    isEnterprise,
    isElite,
    isElitePlus,
    isStarter,
  };
}