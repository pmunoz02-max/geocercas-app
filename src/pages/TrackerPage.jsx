// src/pages/TrackerPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";
import Tracker from "./Tracker.jsx";

export default function TrackerPage() {
  const { t } = useTranslation();
  const tr = (key, fallback, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  const { user, currentOrg, selectOrg } = useAuth();

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

        if (!cancelado && selectOrg) {
          await selectOrg(orgObj.id);
        }

        try {
          await supabase.rpc("set_current_org", { p_org: orgId });
        } catch (e) {
          console.warn("[TrackerPage] set_current_org warning:", e);
        }
      } catch (e) {
        if (!cancelado) {
          console.error("[TrackerPage] error resolviendo organizacion:", e);
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
  }, [user, currentOrg, t]);

  const orgName = currentOrg?.name || tr("trackerPage.labels.yourOrg", "your organization");

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
          {tr("trackerPage.states.preparingTitle", "Preparing tracker...")}
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