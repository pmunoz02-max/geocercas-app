// src/pages/Pricing.jsx
import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/auth.js";
import { supabase } from "@/lib/supabaseClient.js";
import useOrgEntitlements from "@/hooks/useOrgEntitlements.js";
import UpgradeToProButton from "../components/Billing/UpgradeToProButton.jsx";
import ManageSubscriptionButton from "../components/Billing/ManageSubscriptionButton.jsx";

function normalizePlanCode(value) {
  return String(value || "free").toLowerCase();
}

function formatLimit(value, fallback = "—") {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  if (n >= 9999) return "Ilimitadas";
  return String(n);
}

function PlanBadge({ children, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    blue: "border-blue-200 bg-blue-100 text-blue-700",
    emerald: "border-emerald-200 bg-emerald-100 text-emerald-700",
    amber: "border-amber-200 bg-amber-100 text-amber-700",
    violet: "border-violet-200 bg-violet-100 text-violet-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone] || tones.slate}`}
    >
      {children}
    </span>
  );
}

function PlanCard({
  title,
  subtitle,
  price,
  description,
  features,
  cta,
  highlight = false,
  current = false,
}) {
  return (
    <div
      className={`rounded-2xl border p-6 shadow-sm ${
        highlight
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-900"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={`text-xl font-semibold ${highlight ? "text-white" : "text-slate-900"}`}>
            {title}
          </h2>
          <p className={`mt-1 text-sm ${highlight ? "text-slate-300" : "text-slate-600"}`}>
            {subtitle}
          </p>
        </div>

        {current ? (
          <PlanBadge tone={highlight ? "amber" : "emerald"}>Plan actual</PlanBadge>
        ) : null}
      </div>

      <div className="mt-6">
        <div className={`text-3xl font-bold ${highlight ? "text-white" : "text-slate-900"}`}>
          {price}
        </div>
        <p className={`mt-2 text-sm ${highlight ? "text-slate-300" : "text-slate-600"}`}>
          {description}
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {features.map((item) => (
          <div
            key={item}
            className={`flex items-start gap-3 text-sm ${highlight ? "text-slate-200" : "text-slate-700"}`}
          >
            <span className={`mt-0.5 ${highlight ? "text-white" : "text-slate-900"}`}>•</span>
            <span>{item}</span>
          </div>
        ))}
      </div>

      <div className="mt-8">{cta}</div>
    </div>
  );
}

function ContactSalesButton() {
  return (
    <a
      href="mailto:ventas@tugeocercas.com?subject=App%20Geocercas%20-%20Plan%20Enterprise"
      className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
    >
      Contactar ventas
    </a>
  );
}

function FreePlanAction({ currentPlanCode }) {
  if (currentPlanCode === "free") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        Ya estás usando el plan Free.
      </div>
    );
  }

  return (
    <Link
      to="/billing"
      className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
    >
      Ver estado en Billing
    </Link>
  );
}

function ProPlanAction({
  authenticated,
  currentOrgId,
  currentPlanCode,
  getAccessToken,
}) {
  if (!authenticated || !currentOrgId) {
    return (
      <Link
        to="/billing"
        className="inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
      >
        Ir a Billing
      </Link>
    );
  }

  if (currentPlanCode === "free") {
    return (
      <UpgradeToProButton
        orgId={currentOrgId}
        getAccessToken={getAccessToken}
      />
    );
  }

  if (currentPlanCode === "pro") {
    return (
      <ManageSubscriptionButton
        orgId={currentOrgId}
        getAccessToken={getAccessToken}
        returnUrl={`${window.location.origin}/pricing`}
      />
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
      Tu organización ya tiene un plan superior o distinto de Free.
      Revisa Billing para administrarlo.
      <div className="mt-3">
        <Link
          to="/billing"
          className="inline-flex items-center justify-center rounded-xl bg-emerald-700 px-4 py-2.5 font-semibold text-white transition hover:bg-emerald-800"
        >
          Ir a Billing
        </Link>
      </div>
    </div>
  );
}

export default function Pricing() {
  const { loading, ready, authenticated, currentOrgId } = useAuth();
  const {
    loading: entitlementsLoading,
    error: entitlementsError,
    planCode,
    maxGeocercas,
    maxTrackers,
  } = useOrgEntitlements();

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }

  const currentPlanCode = useMemo(() => normalizePlanCode(planCode), [planCode]);

  const freeFeatures = useMemo(
    () => [
      "Ideal para empezar y validar el flujo base",
      "Hasta 1 tracker",
      "Geocercas con límite por plan",
      "Acceso a Billing y futura ruta de upgrade",
      "Backend sigue aplicando enforcement real",
    ],
    []
  );

  const proFeatures = useMemo(
    () => [
      `Hasta ${formatLimit(maxTrackers || 3, "3")} trackers por organización`,
      `Hasta ${formatLimit(maxGeocercas || 9999, "Ilimitadas")} geocercas`,
      "Módulo Tracker habilitado",
      "Invitación de trackers habilitada",
      "Suscripción autogestionable con Stripe",
    ],
    [maxTrackers, maxGeocercas]
  );

  const enterpriseFeatures = useMemo(
    () => [
      "Atención comercial y onboarding guiado",
      "Límites y condiciones ajustables",
      "Preparado para operación con múltiples equipos",
      "Escalamiento comercial y acuerdos especiales",
      "Contacto directo con ventas",
    ],
    []
  );

  if (loading || !ready) return null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Planes y precios</h1>
            <p className="mt-2 max-w-3xl text-slate-600">
              Esta pantalla trabaja en <b>PREVIEW</b> y reutiliza Stripe en modo <b>TEST</b>.
              No afecta producción.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/billing"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              Ir a Billing
            </Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Plan detectado</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {currentPlanCode.toUpperCase()}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Máx. geocercas</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {entitlementsLoading ? "Cargando..." : formatLimit(maxGeocercas, "—")}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Máx. trackers</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {entitlementsLoading ? "Cargando..." : formatLimit(maxTrackers, "—")}
            </div>
          </div>
        </div>

        {entitlementsError ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {entitlementsError}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <PlanCard
          title="Free"
          subtitle="Para comenzar"
          price="$0"
          description="Pensado para validar el uso inicial de la plataforma."
          current={currentPlanCode === "free"}
          features={freeFeatures}
          cta={<FreePlanAction currentPlanCode={currentPlanCode} />}
        />

        <PlanCard
          title="Pro"
          subtitle="Operación SaaS activa"
          price="Stripe TEST"
          description="Plan recomendado para habilitar el módulo Tracker y operar con suscripción."
          highlight
          current={currentPlanCode === "pro"}
          features={proFeatures}
          cta={
            <ProPlanAction
              authenticated={authenticated}
              currentOrgId={currentOrgId}
              currentPlanCode={currentPlanCode}
              getAccessToken={getAccessToken}
            />
          }
        />

        <PlanCard
          title="Enterprise"
          subtitle="Venta asistida"
          price="A medida"
          description="Para organizaciones que requieren condiciones comerciales especiales."
          current={currentPlanCode === "enterprise"}
          features={enterpriseFeatures}
          cta={<ContactSalesButton />}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Notas de esta fase</h2>
        <div className="mt-3 space-y-2 text-sm text-slate-600">
          <p>
            El backend sigue siendo la autoridad real del plan. Esta página solo refleja el plan
            y muestra las acciones comerciales disponibles.
          </p>
          <p>
            El upgrade a Pro reutiliza el flujo existente de Stripe Checkout. La administración de
            suscripción reutiliza Stripe Customer Portal.
          </p>
          <p>
            Enterprise queda presentado como canal comercial, sin activar checkout automático.
          </p>
        </div>
      </div>
    </div>
  );
}