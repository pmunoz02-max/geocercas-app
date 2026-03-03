// src/pages/Billing.jsx
import React from "react";
import { useAuth } from "@/context/auth.js";
import { supabase } from "../lib/supabaseClient.js";
import UpgradeToProButton from "../components/Billing/UpgradeToProButton.jsx";

export default function Billing() {
  const { loading, ready, authenticated, user, currentOrgId } = useAuth();

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }

  if (loading || !ready) return null;

  if (!authenticated || !user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <h1 className="text-xl font-semibold text-slate-900">Billing</h1>
          <p className="mt-2 text-slate-600">Inicia sesión para administrar tu plan.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <h1 className="text-2xl font-semibold text-slate-900">Billing</h1>
        <p className="mt-2 text-slate-600">
          Monetización en <b>PREVIEW</b> (Stripe TEST). No afecta producción.
        </p>
        <div className="mt-3 text-sm text-slate-700">
          <b>Email:</b> {user.email}
        </div>
        <div className="mt-1 text-sm text-slate-700">
          <b>Org ID:</b> <span className="font-mono">{currentOrgId}</span>
        </div>
      </div>

      <UpgradeToProButton orgId={currentOrgId} getAccessToken={getAccessToken} />
    </div>
  );
}