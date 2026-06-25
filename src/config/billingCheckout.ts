import { PRICING, type PlanCode } from "./pricing";

export type CheckoutPlanCode = Extract<PlanCode, "pro" | "enterprise">;

export type CheckoutProvider = "external_checkout" | "disabled";

const CHECKOUT_URLS: Record<CheckoutPlanCode, string> = {
  pro:
    import.meta.env.VITE_CHECKOUT_PRO_URL ||
    "https://test.checkout.dodopayments.com/buy/pdt_0NhoMPN43aLOXnHSZhrTk?quantity=1",
  enterprise:
    import.meta.env.VITE_CHECKOUT_ENTERPRISE_URL ||
    "https://test.checkout.dodopayments.com/buy/pdt_0NhoND6E41RsKWVP43fW1?quantity=1",
};

export const BILLING_CHECKOUT_PROVIDER: CheckoutProvider =
  (import.meta.env.VITE_BILLING_PROVIDER as CheckoutProvider) || "external_checkout";

export const BILLING_CHECKOUT_MODE =
  import.meta.env.VITE_CHECKOUT_MODE ||
  (CHECKOUT_URLS.pro.includes("test.checkout") || CHECKOUT_URLS.enterprise.includes("test.checkout")
    ? "test"
    : "preview");

export function getCheckoutUrl(plan: CheckoutPlanCode): string {
  if (BILLING_CHECKOUT_PROVIDER === "disabled") return "";
  return CHECKOUT_URLS[plan] || "";
}

export function isCheckoutConfigured(plan: CheckoutPlanCode): boolean {
  return Boolean(getCheckoutUrl(plan));
}

export function getCheckoutPlanLabel(plan: CheckoutPlanCode): string {
  return PRICING[plan]?.label || plan;
}

export function getCheckoutPlanPrice(plan: CheckoutPlanCode): number {
  return PRICING[plan]?.monthlyUsd || 0;
}

export function getCheckoutSafetyLabel(): string {
  if (BILLING_CHECKOUT_MODE === "test") return "TEST checkout";
  if (BILLING_CHECKOUT_MODE === "live") return "Live checkout";
  return "Preview checkout";
}
