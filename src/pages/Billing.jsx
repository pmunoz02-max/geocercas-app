// src/pages/Billing.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/auth.js";
import { supabase } from "../lib/supabaseClient.js";
import UpgradeToProButton from "../components/Billing/UpgradeToProButton.jsx";
import ManageSubscriptionButton from "../components/Billing/ManageSubscriptionButton.jsx";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-EC", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function labelPlan(planCode) {
  const v = String(planCode || "free").toLowerCase();
  if (v === "pro") return "PRO";
  if (v === "free") return "FREE";
  if (v === "enterprise") return "ENTERPRISE";
  if (v === "starter") return "STARTER";
  if (v === "elite") return "ELITE";
  if (v === "elite_plus") return "ELITE+";
  return v.toUpperCase();
}

function labelStatus(planStatus) {
  const v = String(planStatus || "free").toLowerCase();

  if (v === "trialing") return "Trial";
  if (v === "active") return "Activo";
  if (v === "past_due") return "Pago pendiente";
  if (v === "canceled") return "Cancelado";
  if (v === "free") return "Free";

  return v;
}

export default function Billing() {
  const { loading, ready, authenticated, user, currentOrgId } = useAuth();

  const [billing, setBilling] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState("");

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadBilling() {
      if (!authenticated || !user || !currentOrgId) {
        if (!cancelled) {
          setBilling(null);
          setBillingError("");
          setBillingLoading(false);
        }
        return;
      }

      try {
        setBillingLoading(true);
        setBillingError("");

        const { data, error } = await supabase
          .from("org_billing")
          .select(
            `
            org_id,
            plan_code,
            plan_status,
            trial_ends_at,
            current_period_end,
            stripe_customer_id,
            stripe_subscription_id,
            stripe_price_id,
            cancel_at_period_end,
            canceled_at,
            last_stripe_event_at
          `
          )
          .eq("org_id", currentOrgId)
          .maybeSingle();

        if (error) throw error;

        if (!cancelled) {
          setBilling(data || null);
        }
      } catch (err) {
        if (!cancelled) {
          setBilling(null);
          setBillingError(err?.message || "No se pudo cargar el estado del plan.");
        }
      } finally {
        if (!cancelled) {
          setBillingLoading(false);
        }
      }
    }

    loadBilling();

    return () => {
      cancelled = true;
    };
  }, [authenticated, user, currentOrgId]);

  const effectivePlanCode = useMemo(() => {
    return String(billing?.plan_code || "free").toLowerCase();
  }, [billing]);

  const effectivePlanStatus = useMemo(() => {
    return String(billing?.plan_status || "free").toLowerCase();
  }, [billing]);

  const shouldShowUpgradeButton = useMemo(() => {
    return !!currentOrgId && effectivePlanCode === "free";
  }, [currentOrgId, effectivePlanCode]);

  const hasStripeSubscription = useMemo(() => {
    return !!billing?.stripe_customer_id || !!billing?.stripe_subscription_id;
  }, [billing]);

  const shouldShowManageButton = useMemo(() => {
    if (!currentOrgId) return false;
    if (!hasStripeSubscription) return false;

    return ["trialing", "active", "past_due", "canceled"].includes(effectivePlanStatus);
  }, [currentOrgId, hasStripeSubscription, effectivePlanStatus]);

  if (loading || !ready) return null;

  if (!authenticated || !user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <h1 className="text-xl font-semibold text-slate-900">Billing</h1>
          <p className="mt-2 text-slate-600">
            Inicia sesión para administrar tu plan.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Billing</h1>
            <p className="mt-2 text-slate-600">
              Monetización en <b>PREVIEW</b> (Stripe TEST). No afecta producción.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              Ver planes
            </Link>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700">
          <div>
            <b>Email:</b> {user.email}
          </div>
          <div>
            <b>Org ID:</b>{" "}
            <span className="font-mono break-all">{currentOrgId || "—"}</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900">Estado del plan</h2>

        {billingLoading ? (
          <p className="mt-3 text-sm text-slate-600">Cargando estado del plan...</p>
        ) : billingError ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {billingError}
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Plan actual
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {labelPlan(effectivePlanCode)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Estado
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {labelStatus(effectivePlanStatus)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Trial hasta
                </div>
                <div className="mt-1 text-base font-medium text-slate-900">
                  {formatDate(billing?.trial_ends_at)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Período actual hasta
                </div>
                <div className="mt-1 text-base font-medium text-slate-900">
                  {formatDate(billing?.current_period_end)}
                </div>
              </div>
            </div>

            {shouldShowManageButton ? (
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  Gestión de suscripción
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  Abre Stripe Customer Portal para actualizar tarjeta, cancelar o revisar tu suscripción.
                </p>

                <div className="mt-4">
                  <ManageSubscriptionButton
                    orgId={currentOrgId}
                    getAccessToken={getAccessToken}
                    returnUrl={`${window.location.origin}/billing`}
                  />
                </div>
              </div>
            ) : null}
          </>
        )}

        {!billingLoading && !billingError && billing?.cancel_at_period_end ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Tu suscripción está configurada para cancelarse al final del período actual.
          </div>
        ) : null}
      </div>

      {shouldShowUpgradeButton ? (
        <div className="space-y-4">
          <UpgradeToProButton
            orgId={currentOrgId}
            getAccessToken={getAccessToken}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">
              ¿Quieres comparar antes de subir de plan?
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Revisa la página de planes para comparar Free, Pro y Enterprise.
            </p>
            <div className="mt-4">
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                Ver planes
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">
          Ya existe un plan activo para esta organización. No se muestra el botón de upgrade.
        </div>
      )}
    </div>
  );
}