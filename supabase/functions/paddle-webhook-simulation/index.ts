import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, paddle-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseSignature(header: string) {
  const parts = header.split(";").map((p) => p.trim());
  const out: Record<string, string> = {};

  for (const part of parts) {
    const [key, ...rest] = part.split("=");
    if (!key || rest.length === 0) continue;
    out[key] = rest.join("=");
  }

  const tsRaw = out.ts ?? null;
  const h1Raw = out.h1 ?? null;

  const tsUnix = tsRaw != null ? Number(tsRaw) : Number.NaN;
  const tsIsValidUnixSeconds = Number.isFinite(tsUnix) && tsUnix > 0;

  return {
    ts: tsRaw,
    h1: h1Raw,
    tsUnix: tsIsValidUnixSeconds ? tsUnix : null,
  };
}

function isTimestampWithinTolerance(tsUnix: number, toleranceSeconds = 300): boolean {
  if (!Number.isFinite(tsUnix)) return false;
  const nowUnix = Date.now() / 1000;
  const diffSeconds = Math.abs(nowUnix - tsUnix);
  return diffSeconds <= toleranceSeconds;
}

function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}

async function hmac(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const bytes = new Uint8Array(signature);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  try {
    const WEBHOOK_SECRET = requireEnv("PADDLE_WEBHOOK_SIMULATION_SECRET");
    const rawBody = await req.text();

    const signatureHeader = req.headers.get("paddle-signature") ??
      req.headers.get("Paddle-Signature");

    if (!signatureHeader) {
      return json(401, { ok: false, error: "Missing signature" });
    }

    const { ts, h1, tsUnix } = parseSignature(signatureHeader);

    if (!ts || !h1) {
      return json(401, { ok: false, error: "Invalid signature format" });
    }

    if (tsUnix == null || !isTimestampWithinTolerance(tsUnix, 300)) {
      return json(401, {
        ok: false,
        error: "Invalid or expired signature timestamp",
      });
    }

    try {
      const computed = await hmac(WEBHOOK_SECRET, `${ts}:${rawBody}`);
      if (!timingSafeHexEqual(computed, h1)) {
        return json(401, { ok: false, error: "Invalid signature" });
      }
    } catch {
      return json(401, { ok: false, error: "Signature validation failed" });
    }

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return json(400, { ok: false, error: "Invalid JSON body" });
    }

    const eventType = asString(event?.event_type);
    const eventId = asString(event?.event_id);
    const occurredAt = asString(event?.occurred_at);

    if (!eventType || !eventId || !occurredAt) {
      return json(400, { ok: false, error: "Missing required event metadata" });
    }

    console.log("[PADDLE WEBHOOK SIMULATION] validated event", {
      event_type: eventType,
      event_id: eventId,
      occurred_at: occurredAt,
    });

    return json(200, {
      ok: true,
      simulation: true,
      event_type: eventType,
      event_id: eventId,
      occurred_at: occurredAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(500, { ok: false, error: message });
  }
});
