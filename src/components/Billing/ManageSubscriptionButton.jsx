import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useTranslation } from "react-i18next";

export default function ManageSubscriptionButton({
  orgId,
  disabled = false,
  buttonLabel = "Suspend plan",
}) {
  const { t } = useTranslation();
  // Friendly Paddle error handler for billing cancel/modify
  function getFriendlyBillingError(err, t) {
    if (!err) return "";
    try {
      const parsed = typeof err === "string" ? JSON.parse(err) : err;
      const code =
        parsed?.paddle_error?.error?.code ||
        parsed?.code ||
        parsed?.error ||
        "";
      if (code === "subscription_locked_pending_changes") {
        return t(
          "billing.errors.pendingChange",
          "There is already a scheduled change for this subscription. Please wait before modifying the plan."
        );
      }
      return t(
        "billing.errors.generic",
        "Unable to process the request. Please try again."
      );
    } catch {
      return t(
        "billing.errors.generic",
        "Unable to process the request. Please try again."
      );
    }
  }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSuspendPlan() {
    if (loading || disabled) return;

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      if (!orgId) {
        throw new Error("Missing organization context.");
      }

      const { data, error: invokeError } = await supabase.functions.invoke(
        "paddle-cancel-subscription",
        {
          body: { org_id: orgId },
        }
      );

      if (invokeError) {
        console.error("[manage-subscription] invoke error", invokeError);

        let details = invokeError.message || "Cancel failed";
        try {
          const raw = await invokeError.context?.text?.();
          console.error("[manage-subscription] raw error body", raw);
          if (raw) details = raw;
        } catch {
          // noop
        }

        throw new Error(details);
      }

      if (data && data.ok === false) {
        throw new Error(JSON.stringify(data));
      }

      setSuccess("Plan will be canceled at end of billing period");
    } catch (err) {
      console.error("[manage-subscription] final error", err);
      setError(err?.message || "Could not suspend the plan.");
    } finally {
      setLoading(false);
    }
  }

  const canManageSubscription = !loading && !disabled && !!orgId;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleSuspendPlan}
        disabled={!canManageSubscription}
        className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
          !canManageSubscription
            ? "bg-slate-300 text-slate-500 cursor-not-allowed"
            : "bg-slate-900 text-white hover:bg-slate-800"
        }`}
      >
        {loading ? "Suspending..." : buttonLabel}
      </button>

      {error && !loading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 whitespace-pre-wrap break-words">
          {getFriendlyBillingError(error, t)}
        </div>
      )}

      {success && !loading && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {success}
        </div>
      )}
    </div>
  );
}