// src/pages/TrackerPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabaseClient";
import { useAuth } from "@/context/auth.js";
import Tracker from "./Tracker.jsx";
import useOrgEntitlements from "@/hooks/useOrgEntitlements.js";
import UpgradeToProButton from "@/components/Billing/UpgradeToProButton.jsx";

function normalizePlanLabel(planCode) {
  const v = String(planCode || "").toLowerCase();
  if (v === "pro") return "PRO";
  if (v === "enterprise") return "ENTERPRISE";
  if (v === "elite_plus") return "ELITE PLUS";
  if (v === "elite") return "ELITE";
  if (v === "starter") return "STARTER";
  if (v === "free") return "FREE";
  return v ? v.toUpperCase() : "—";
}

export default function TrackerPage() {
  const { t } = useTranslation();
  const tr = (key, fallback, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  const { user, currentOrg, setCurrentOrg } = useAuth();
  const {
    loading: entitlementsLoading,
    error: entitlementsError,
    planCode,
    isFree,
  } = useOrgEntitlements();

  const [resolviendoOrg, setResolviendoOrg] = useState(true);
  const [error, setError] = useState(null);

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }

  useEffect(() => {
    let cancelado = false;

    async function ensureOrg() {
      if (!user) {
        setResolviendoOrg(false);
        return;
      }

      if (currentOrg && currentOrg.id) {
        setResolviendoOrg(false);
        return;
      }

      try {
        let orgId = null;
        let role = null;

        const { data: membership, error: membershipErr } = await supabase
          .from("memberships")
          .select("org_id, role, is_default, revoked_at")
          .eq("user_id", user.id)
          .is("revoked_at", null)
          .order("is_default", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (membershipErr) {
          console.warn("[TrackerPage] memberships error:", membershipErr);
        }

        if (membership?.org_id) {
          orgId = membership.org_id;
          role = membership.role || "tracker";
        }

        if (!orgId) {
          const { data: legacyRows, error: legacyErr } = await supabase
            .from("user_organizations")
            .select("org_id, role")
            .eq("user_id", user.id)
            .limit(1);

          if (legacyErr) {
            console.warn("[TrackerPage] user_organizations fallback error:", legacyErr);
          }

          const legacy = Array.isArray(legacyRows) ? legacyRows[0] : null;
          if (legacy?.org_id) {
            orgId = legacy.org_id;
            role = legacy.role || "tracker";
          }
        }

        if (!orgId) {
          if (!cancelado) {
            setError(
              tr(
                "trackerPage.errors.noActiveOrgAssigned",
                "Your user does not have any active organization assigned. Contact the administrator."
              )
            );
          }
          return;
        }

        const { data: orgData, error: orgErr } = await supabase
          .from("organizations")
          .select("id, name, slug")
          .eq("id", orgId)
          .maybeSingle();

        if (orgErr) {
          console.warn("[TrackerPage] organizations error:", orgErr);
        }

        const orgObj = {
          id: orgData?.id || orgId,
          name: orgData?.name || tr("trackerPage.labels.noName", "(unnamed)"),
          code: orgData?.slug || null,
          role: role || "tracker",
        };

        if (!cancelado) {
          setCurrentOrg(orgObj);
        }

        try {
            // Use setOrgSafe fallback logic
            try {
              await supabase.rpc("set_current_org", {
                p_org: orgId,
              });
            } catch (e) {
              console.error("[TrackerPage] set org failed:", e);
            }
      } catch (e) {
        if (!cancelado) {
          console.error("[TrackerPage] error resolviendo organización:", e);
          setError(
            tr(
              "trackerPage.errors.resolveOrg",
              "Could not determine your organization. Contact the administrator."
            )
          );
        }
      } finally {
        if (!cancelado) {
          setResolviendoOrg(false);
        }
      }
    }

    ensureOrg();

    return () => {
      cancelado = true;
    };
  }, [user, currentOrg, setCurrentOrg, t]);

  const orgName = currentOrg?.name || tr("trackerPage.labels.yourOrg", "your organization");
  const currentOrgId = currentOrg?.id || null;

  const trackerBlockedByPlan = useMemo(() => {
    return !entitlementsLoading && isFree;
  }, [entitlementsLoading, isFree]);

  if (!user) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">
          {tr("trackerPage.auth.title", "Tracker access")}
        </h1>
        <p className="text-gray-600 text-sm">
          {tr(
            "trackerPage.auth.description",
            "No active session was found. Open the Magic Link you received by email to start sending your location."
          )}
        </p>
      </div>
    );
  }

  if (resolviendoOrg) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">
          {tr("trackerPage.states.preparingTitle", "Preparing tracker…")}
        </h1>
        <p className="text-gray-600 text-sm">
          {tr(
            "trackerPage.states.preparingBody",
            "We are verifying your organization and preparing the sending of your location. Please wait a moment."
          )}
        </p>
      </div>
    );
  }

  if (entitlementsLoading) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">
          {tr("trackerPage.states.validatingPlanTitle", "Validating plan…")}
        </h1>
        <p className="text-gray-600 text-sm">
          {tr(
            "trackerPage.states.validatingPlanBody",
            "We are verifying whether your organization has the Tracker module enabled."
          )}
        </p>
      </div>
    );
  }

  if (entitlementsError) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold mb-3">
          {tr("trackerPage.title", "Tracker")}
        </h1>
        <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded px-4 py-3 text-sm">
          {tr(
            "trackerPage.errors.planValidation",
            "Could not validate the organization's plan. Please try again."
          )}
          <div className="mt-2 font-mono text-xs break-all">{entitlementsError}</div>
        </div>
      </div>
    );
  }

  if (trackerBlockedByPlan) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold">
          {tr("trackerPage.title", "Tracker")}
        </h1>

        <div className="border border-amber-300 bg-amber-50 text-amber-900 rounded-xl px-4 py-4">
          <div className="text-base font-semibold">
            {tr(
              "trackerPage.planBlocked.title",
              "The Tracker module is not available on the current plan."
            )}
          </div>
          <div className="mt-2 text-sm">
            {tr("trackerPage.planBlocked.organization", "Organization")}:{" "}
            <span className="font-semibold">{orgName}</span>
          </div>
          <div className="mt-1 text-sm">
            {tr("trackerPage.planBlocked.detectedPlan", "Detected plan")}:{" "}
            <span className="font-semibold">{normalizePlanLabel(planCode)}</span>
          </div>
          <div className="mt-3 text-sm">
            {tr(
              "trackerPage.planBlocked.description",
              "To send and manage real-time positions, upgrade this organization to PRO or higher."
            )}
          </div>
        </div>

        {currentOrgId ? (
          <div className="border rounded-xl p-4 bg-white">
            <div className="text-sm text-gray-700 mb-3">
              {tr(
                "trackerPage.planBlocked.upgradePrompt",
                "Upgrade to enable Tracker for this organization."
              )}
            </div>
            <UpgradeToProButton
              orgId={currentOrgId}
              getAccessToken={getAccessToken}
            />
          </div>
        ) : null}

        <div className="border border-slate-200 bg-slate-50 text-slate-700 rounded-xl px-4 py-3 text-sm">
          {tr(
            "trackerPage.planBlocked.backendAuthority",
            "The backend remains the authority. This block is visual and part of the user experience to reflect the organization's active plan."
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-3">
        {tr("trackerPage.active.title", "Active tracker")}
      </h1>

      {error ? (
        <div className="border border-red-300 bg-red-50 text-red-800 rounded px-4 py-2 text-sm mb-4">
          {error}
        </div>
      ) : (
        <div className="border border-emerald-300 bg-emerald-50 text-emerald-800 rounded px-4 py-3 text-sm mb-4">
          {tr(
            "trackerPage.active.descriptionPrefix",
            "You are sending your position to the organization"
          )}{" "}
          <span className="font-semibold">{orgName}</span>{" "}
          {tr(
            "trackerPage.active.descriptionSuffix",
            "to which you belong."
          )}
        </div>
      )}

      <div className="border rounded-xl p-3 bg-white">
        <Tracker />
      </div>
    </div>
  );
}