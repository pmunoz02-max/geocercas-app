export const PRICING = {
  free: {
    code: "free",
    label: "Free",
    monthlyUsd: 0,
  },
  pro: {
    code: "pro",
    label: "Pro",
    monthlyUsd: 29,
  },
  enterprise: {
    code: "enterprise",
    label: "Enterprise",
    monthlyUsd: 99,
  },
  enterprise_100: { code: "enterprise_100", label: "ENTERPRISE 100", monthlyUsd: 169 },
} as const;

export const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, enterprise: 2, enterprise_100: 3 };
export const PLAN_LIMITS = {
  free: { max_geocercas: 1, max_trackers: 2 },
  pro: { max_geocercas: 25, max_trackers: 10 },
  enterprise: { max_geocercas: 250, max_trackers: 50 },
  enterprise_100: { max_geocercas: 250, max_trackers: 100 },
} as const;

export type PlanCode = keyof typeof PRICING;

export const BILLING_CURRENCY = "USD";
export const BILLING_INTERVAL = "monthly";

export function formatPlanPrice(plan: PlanCode, lang: string = "en"): string {
  const planData = PRICING[plan];
  if (!planData) return "";
  const price = planData.monthlyUsd;
  const currency = BILLING_CURRENCY;
  let locale: string;
  switch (lang) {
    case "es":
      locale = "es-MX";
      break;
    case "fr":
      locale = "fr-FR";
      break;
    default:
      locale = "en-US";
  }
  return price === 0
    ? (lang === "fr" ? "Gratuit" : lang === "es" ? "Gratis" : "Free")
    : price.toLocaleString(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
}
