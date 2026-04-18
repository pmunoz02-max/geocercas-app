// src/components/Billing/ManageSubscriptionButton.jsx
import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient.js";



export default function ManageSubscriptionButton({
  orgId,
  getAccessToken,
  returnUrl,
  disabled = false,
  unavailableMessage = "Subscription management is temporarily unavailable in this version.",
  buttonLabel = "Suspend plan",
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [portalUrl, setPortalUrl] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);

  async function handleClick() {
    if (portalLoading || disabled) return;
    try {
      setPortalLoading(true);
      setError("");
      const accessToken = await getAccessToken?.();
      if (!accessToken) {
        throw new Error("Could not get user session.");
      }

      const target = typeof returnUrl === "string" && returnUrl.trim()
        ? returnUrl.trim()
        : "/billing/cancel";

      const isRelativePath = target.startsWith("/");
      const isAbsoluteHttp = /^https?:\/\//i.test(target);
      if (!isRelativePath && !isAbsoluteHttp) {
        throw new Error(unavailableMessage || "Subscription cancellation is temporarily unavailable.");
      }

      window.location.href = target;
      return;
    } catch (err) {
      setError(err?.message || "Could not open subscription management.");
    } finally {
      setPortalLoading(false);
    }
  }

  const canManageSubscription = !portalLoading && !disabled;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={!canManageSubscription}
        className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
          !canManageSubscription
            ? "bg-slate-300 text-slate-500 cursor-not-allowed"
            : "bg-slate-900 text-white hover:bg-slate-800"
        }`}
      >
        {portalLoading ? "Opening..." : buttonLabel}
      </button>

      {error && !portalLoading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {error}
        </div>
      )}
    </div>
  );
}