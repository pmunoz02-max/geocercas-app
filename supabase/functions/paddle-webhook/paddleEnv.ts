// paddleEnv.ts (Deno/Edge version for webhook)
export function getPaddleEnv() {
  const env = typeof Deno !== "undefined" ? Deno.env.get("PADDLE_ENV") : undefined;
  if (env === "live" || env === "sandbox") return env;
  return "sandbox";
}

export function getPaddlePriceId(plan) {
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
