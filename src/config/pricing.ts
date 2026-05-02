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
