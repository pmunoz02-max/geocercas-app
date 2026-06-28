import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import UpgradeToProButton from "@/components/Billing/UpgradeToProButton";
import { useAuth } from "@/context/auth.js";
import { supabase } from "@/lib/supabaseClient.js";
import { getCheckoutSafetyLabel } from "@/config/billingCheckout";
import { PRICING, formatPlanPrice } from "@/config/pricing";

const PLAN_RANK = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

function normalizePlanCode(value) {
  const code = String(value || "free").toLowerCase().trim();
  if (code === "enterprise") return "enterprise";
  if (code === "pro") return "pro";
  return "free";
}

function normalizePlanStatus(value) {
  return String(value || "free").toLowerCase().trim();
}

function isActivePaidStatus(status) {
  return ["active", "trialing"].includes(normalizePlanStatus(status));
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("es-EC", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function CurrentPlanNotice({ children, highlighted = false }) {
  return (
    <div
      className={`rounded-xl border p-4 text-sm ${
        highlighted
          ? "border-emerald-200 bg-white/10 text-emerald-50"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {children}
    </div>
  );
}

function PlanAction({
  plan,
  currentPlanCode,
  hasActivePaidPlan,
  authenticated,
  currentOrgId,
  currentPeriodEnd,
  highlighted,
}) {
  const buttonLabel = plan === "enterprise" ? "Suscribirse a Enterprise" : "Suscribirse a PRO";
  const currentPlanLabel = currentPlanCode === "enterprise" ? "Enterprise" : currentPlanCode === "pro" ? "PRO" : "Free";
  const billingButtonClass = highlighted
    ? "mt-3 inline-flex w-full items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
    : "mt-3 inline-flex w-full items-center justify-center rounded-xl border border-emerald-300 bg-white px-6 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50";
  const checkoutButtonClass = highlighted
    ? "inline-flex w-full items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
    : "inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500";

  if (authenticated && currentOrgId && hasActivePaidPlan && currentPlanCode === plan) {
    const renewal = formatDate(currentPeriodEnd);
    return (
      <CurrentPlanNotice highlighted={highlighted}>
        <div className="font-semibold">Este es el plan activo de esta organización.</div>
        {renewal ? <div className="mt-1">Renovación estimada: {renewal}</div> : null}
        <Link to="/billing" className={billingButtonClass}>
          Ver facturación
        </Link>
      </CurrentPlanNotice>
    );
  }

  if (
    authenticated &&
    currentOrgId &&
    hasActivePaidPlan &&
    (PLAN_RANK[currentPlanCode] || 0) > (PLAN_RANK[plan] || 0)
  ) {
    return (
      <CurrentPlanNotice highlighted={highlighted}>
        <div className="font-semibold">Tu organización ya tiene {currentPlanLabel}.</div>
        <div className="mt-1">No es necesario abrir otro checkout para este plan.</div>
        <Link to="/billing" className={billingButtonClass}>
          Ver facturación
        </Link>
      </CurrentPlanNotice>
    );
  }

  if (!authenticated || !currentOrgId) {
    return (
      <div className="space-y-2">
        <Link to="/billing" className={checkoutButtonClass}>
          Iniciar sesión para suscribirse
        </Link>
        <p className={`text-xs ${highlighted ? "text-emerald-200" : "text-slate-500"}`}>
          El checkout necesita una organización activa para asociar la suscripción.
        </p>
      </div>
    );
  }

  return (
    <UpgradeToProButton
      orgId={currentOrgId}
      plan={plan}
      label={buttonLabel}
      className={checkoutButtonClass}
    />
  );
}

function PlanCard({
  plan,
  title,
  subtitle,
  description,
  features,
  highlighted = false,
  currentPlanCode,
  hasActivePaidPlan,
  authenticated,
  currentOrgId,
  currentPeriodEnd,
}) {
  const price = formatPlanPrice(plan);
  const isCurrentPlan = hasActivePaidPlan && currentPlanCode === plan;

  return (
    <article
      className={`flex h-full flex-col rounded-3xl border p-7 shadow-sm ${
        highlighted
          ? "border-emerald-950 bg-emerald-950 text-white"
          : "border-emerald-100 bg-white text-emerald-950"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-sm font-semibold ${highlighted ? "text-emerald-200" : "text-emerald-700"}`}>
            {subtitle}
          </p>
          <h2 className={`mt-2 text-2xl font-bold ${highlighted ? "text-white" : "text-emerald-950"}`}>
            {title}
          </h2>
        </div>
        {isCurrentPlan ? (
          <span className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-950">
            Plan actual
          </span>
        ) : highlighted ? (
          <span className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-950">
            Recomendado
          </span>
        ) : null}
      </div>

      <div className="mt-7">
        <div className={`text-4xl font-bold ${highlighted ? "text-white" : "text-emerald-950"}`}>{price}</div>
        <p className={`mt-3 text-sm leading-6 ${highlighted ? "text-emerald-100" : "text-emerald-700"}`}>
          {description}
        </p>
      </div>

      <ul className="mt-7 flex-1 space-y-3">
        {features.map((feature) => (
          <li key={feature} className={`flex gap-3 text-sm ${highlighted ? "text-emerald-50" : "text-emerald-800"}`}>
            <span aria-hidden="true" className={highlighted ? "text-emerald-200" : "text-emerald-700"}>✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <PlanAction
          plan={plan}
          currentPlanCode={currentPlanCode}
          hasActivePaidPlan={hasActivePaidPlan}
          authenticated={authenticated}
          currentOrgId={currentOrgId}
          currentPeriodEnd={currentPeriodEnd}
          highlighted={highlighted}
        />
      </div>
    </article>
  );
}

export default function PublicPricing() {
  const { authenticated, currentOrgId } = useAuth();
  const [billing, setBilling] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadBilling() {
      if (!authenticated || !currentOrgId) {
        setBilling(null);
        setBillingLoading(false);
        return;
      }

      setBillingLoading(true);

      const { data, error } = await supabase
        .from("org_billing")
        .select("org_id, plan_code, subscribed_plan_code, plan_status, billing_provider, current_period_end")
        .eq("org_id", currentOrgId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.warn("[PublicPricing] could not load org_billing", error);
        setBilling(null);
      } else {
        setBilling(data || null);
      }

      setBillingLoading(false);
    }

    loadBilling();

    return () => {
      cancelled = true;
    };
  }, [authenticated, currentOrgId]);

  const currentPlanCode = useMemo(() => {
    return normalizePlanCode(billing?.subscribed_plan_code || billing?.plan_code);
  }, [billing]);

  const currentPlanStatus = normalizePlanStatus(billing?.plan_status);
  const hasActivePaidPlan = isActivePaidStatus(currentPlanStatus) && currentPlanCode !== "free";
  const currentPlanLabel = currentPlanCode === "enterprise" ? "Enterprise" : currentPlanCode === "pro" ? "PRO" : "Free";
  const currentPeriodEnd = billing?.current_period_end || null;

  return (
    <main className="min-h-screen bg-slate-50 text-emerald-950">
      <section className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Geocercas GPS</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-emerald-950 sm:text-5xl">
              Precios simples para operaciones de campo autorizadas
            </h1>
            <p className="mt-5 text-base leading-7 text-slate-700 sm:text-lg">
              Elige un plan mensual para asistencia por geocercas, verificación de actividades de campo y reportes operativos. El checkout es externo y seguro; la app mantiene la gestión de planes de forma independiente del proveedor de pagos.
            </p>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <div className="font-semibold">Modo actual</div>
              <div>{getCheckoutSafetyLabel()}</div>
            </div>

            {authenticated && currentOrgId ? (
              <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-800 shadow-sm">
                <div className="font-semibold">Organización actual</div>
                <div>
                  {billingLoading
                    ? "Verificando plan..."
                    : hasActivePaidPlan
                      ? `Plan activo: ${currentPlanLabel}`
                      : "Sin plan pagado activo"}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <PlanCard
            plan="pro"
            title="Geocercas GPS PRO"
            subtitle="Para equipos pequeños y medianos"
            description="Para organizaciones que necesitan controlar asistencia, geocercas, trackers autorizados y reportes básicos de operación."
            highlighted
            currentPlanCode={currentPlanCode}
            hasActivePaidPlan={hasActivePaidPlan}
            authenticated={authenticated}
            currentOrgId={currentOrgId}
            currentPeriodEnd={currentPeriodEnd}
            features={[
              "Checkout mensual externo",
              "Gestión de trackers autorizados",
              "Geocercas y verificación de actividades",
              "Reportes operativos para administradores",
              "Android operativo sin compras dentro de la app",
            ]}
          />

          <PlanCard
            plan="enterprise"
            title="Geocercas GPS Enterprise"
            subtitle="Para operaciones de mayor escala"
            description="Para organizaciones que requieren mayor capacidad operativa, más control administrativo y una ruta de crecimiento comercial."
            currentPlanCode={currentPlanCode}
            hasActivePaidPlan={hasActivePaidPlan}
            authenticated={authenticated}
            currentOrgId={currentOrgId}
            currentPeriodEnd={currentPeriodEnd}
            features={[
              "Checkout mensual externo",
              "Escalamiento para varios equipos de campo",
              "Mayor capacidad operativa",
              "Reportes y seguimiento para administración",
              "Base preparada para soporte comercial y acuerdos especiales",
            ]}
          />
        </div>

        <div className="mt-10 rounded-3xl border border-emerald-100 bg-white p-6 text-sm leading-6 text-slate-700 shadow-sm">
          <h2 className="text-lg font-semibold text-emerald-950">Uso autorizado de ubicación</h2>
          <p className="mt-2">
            Geocercas GPS está diseñado para operaciones laborales autorizadas. No está destinado a rastreo encubierto, vigilancia personal, acoso o usos no comerciales. Las organizaciones usuarias son responsables de informar a sus trabajadores o contratistas y obtener los avisos o consentimientos requeridos por la normativa aplicable.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link className="font-semibold text-emerald-700 hover:text-emerald-900" to="/authorized-location-use">
              Política de uso de ubicación
            </Link>
            <Link className="font-semibold text-emerald-700 hover:text-emerald-900" to="/terms">
              Términos
            </Link>
            <Link className="font-semibold text-emerald-700 hover:text-emerald-900" to="/privacy">
              Privacidad
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
