// src/components/Billing/ManageSubscriptionButton.jsx
import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";



export default function ManageSubscriptionButton({
  orgId,
  disabled = false,
  buttonLabel = "Suspend plan",
}) {
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

      const { error: invokeError } = await supabase.functions.invoke(
        "paddle-cancel-subscription",
        {
          body: { org_id: orgId },
        },
      );

      if (invokeError) {
        console.error(invokeError);
        throw new Error("Cancel failed");
      }

      setSuccess("Plan will be canceled at end of billing period");
    } catch (err) {
      setError(err?.message || "Could not open subscription management.");
    } finally {
      setLoading(false);
    }
  }

  const canManageSubscription = !loading && !disabled;
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
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {error}
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