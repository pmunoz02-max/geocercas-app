// paddleEnv.ts
// Central Paddle environment/config logic for all environments and usages

export function getPaddleEnv() {
  // Decide by hostname if in browser, else by env var (for backend)
  if (typeof window !== "undefined" && window?.location?.hostname) {
    if (window.location.hostname === "preview.tugeocercas.com") return "sandbox";
    if (window.location.hostname === "app.tugeocercas.com") return "live";
  }
  // Fallback for backend/Edge Functions
  const env = typeof Deno !== "undefined" ? Deno.env.get("PADDLE_ENV") : undefined;
  if (env === "live" || env === "sandbox") return env;
  // Default to sandbox for safety
  return "sandbox";
}

export function getPaddleApiKey() {
  const env = getPaddleEnv();
  if (typeof Deno !== "undefined") {
    return env === "live"
      ? Deno.env.get("PADDLE_API_KEY_LIVE")
      : Deno.env.get("PADDLE_API_KEY_SANDBOX");
  }
  return undefined;
}

export function getPaddlePriceId(plan: "pro" | "enterprise") {
  const env = getPaddleEnv();
  if (typeof Deno !== "undefined") {
    if (plan === "pro") {
      return env === "live"
        ? Deno.env.get("PADDLE_PRO_PRICE_ID_LIVE")
        : Deno.env.get("PADDLE_PRO_PRICE_ID_SANDBOX");
    } else if (plan === "enterprise") {
      return env === "live"
        ? Deno.env.get("PADDLE_ENTERPRISE_PRICE_ID_LIVE")
        : Deno.env.get("PADDLE_ENTERPRISE_PRICE_ID_SANDBOX");
    }
  }
  return undefined;
}

export function getPaddleClientToken() {
  // For frontend usage
  const env = getPaddleEnv();
  if (env === "live") {
    return import.meta.env.VITE_PADDLE_CLIENT_TOKEN_LIVE;
  }
  return import.meta.env.VITE_PADDLE_CLIENT_TOKEN_SANDBOX;
}
