/// <reference path="../_shared/deno.d.ts" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

type Json = Record<string, unknown>;

function json(status: number, body: Json) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) return "";
  return v;
}

function safeParseJson<T>(s: string, fallback: T): T {
  try {
    if (!s || !s.trim()) return fallback;
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function asText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

/**
 * Google Play subscription status mapping (simple)
 * Puedes ajustar más adelante según tu modelo.
 */
function mapGoogleStatusToLocal(raw: any): "active" | "expired" | "canceled" | "paused" | "pending" {
  // subscriptionsv2.get devuelve SubscriptionPurchaseV2.
  // Si no tenemos raw, queda pending.
  if (!raw) return "pending";

  // Heurística segura: si hay lineItems con expiryTime futuro -> active.
  // Si hay cancelReason / pausedState / etc -> mapea.
  // Nota: campo exacto varía; por eso lo hacemos robusto.
  const now = Date.now();

  const lineItems = Array.isArray(raw?.lineItems) ? raw.lineItems : [];
  const expiryMillis = (() => {
    for (const li of lineItems) {
      const exp = li?.expiryTime;
      if (typeof exp === "string") {
        const t = Date.parse(exp);
        if (!Number.isNaN(t)) return t;
      }
    }
    return null;
  })();

  // Paused?
  if (raw?.pausedState || raw?.pauseState) return "paused";

  // Canceled?
  if (raw?.canceledState || raw?.cancelReason) return "canceled";

  if (expiryMillis !== null) {
    return expiryMillis > now ? "active" : "expired";
  }

  // fallback
  return "pending";
}

async function fetchGoogleSubscriptionV2(params: {
  packageName: string;
  token: string; // purchase_token
  serviceAccountJson: string;
}): Promise<any> {
  const { packageName, token, serviceAccountJson } = params;

  // Si está vacío, no llamamos Google
  if (!packageName || !token || !serviceAccountJson) return null;

  // ---- OAuth2 Service Account -> Access Token ----
  // Implementación minimalista: firma JWT y canjea por access_token.
  // Para no meter dependencias pesadas, usamos WebCrypto + importKey.
  // (Si luego prefieres, lo migramos a google-auth-library en un backend Node.)
  const sa = JSON.parse(serviceAccountJson);
  const clientEmail = sa.client_email;
  const privateKeyPem = sa.private_key;

  if (!clientEmail || !privateKeyPem) {
    throw new Error("Invalid GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSec,
    exp: nowSec + 3600,
  };

  function b64url(input: Uint8Array) {
    return btoa(String.fromCharCode(...input))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  const enc = new TextEncoder();
  const headerB64 = b64url(enc.encode(JSON.stringify(header)));
  const claimB64 = b64url(enc.encode(JSON.stringify(claimSet)));
  const unsigned = `${headerB64}.${claimB64}`;

  function pemToArrayBuffer(pem: string) {
    const b64 = pem
      .replace(/-----BEGIN PRIVATE KEY-----/g, "")
      .replace(/-----END PRIVATE KEY-----/g, "")
      .replace(/\s+/g, "");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  const keyBuf = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuf,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, enc.encode(unsigned)),
  );
  const signedJwt = `${unsigned}.${b64url(sig)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }),
  });

  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`Google OAuth token error: ${tokenRes.status} ${t}`);
  }
  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token as string;
  if (!accessToken) throw new Error("No access_token from Google");

  // ---- Call Google Play Developer API subscriptionsv2.get ----
  // Endpoint base: https://androidpublisher.googleapis.com :contentReference[oaicite:3]{index=3}
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`;

  const subRes = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!subRes.ok) {
    const t = await subRes.text();
    throw new Error(`Google subscriptionsv2.get error: ${subRes.status} ${t}`);
  }

  return await subRes.json();
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const supabaseUrl = mustEnv("SUPABASE_URL");
  const serviceRole = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRole) {
    return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }

  const auth = req.headers.get("Authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!jwt) return json(401, { error: "Missing user JWT" });

  const supabase = createClient(supabaseUrl, serviceRole, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  // Validar usuario
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user?.id) {
    return json(401, { error: "Invalid JWT" });
  }

  const body = await req.json().catch(() => ({}));
  const org_id = asText(body?.org_id);
  const product_id = asText(body?.product_id);
  const purchase_token = asText(body?.purchase_token);

  if (!isUuid(org_id)) return json(400, { error: "Invalid org_id" });
  if (!product_id) return json(400, { error: "Missing product_id" });
  if (!purchase_token) return json(400, { error: "Missing purchase_token" });

  // Map product_id -> plan_code (si no existe, default starter)
  const planMap = safeParseJson<Record<string, string>>(
    mustEnv("PLAN_PRODUCT_MAP_JSON"),
    {},
  );
  const plan_code = planMap[product_id] ?? "starter";

  const packageName = mustEnv("GOOGLE_PLAY_PACKAGE_NAME"); // puede estar vacío
  const saJson = mustEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"); // puede estar vacío

  let googleRaw: any = null;
  let status: "active" | "expired" | "canceled" | "paused" | "pending" = "pending";
  let current_period_end: string | null = null;

  // Si aún no hay credenciales, guardamos PENDING y salimos sin cambiar plan
  const haveGoogleCreds = !!(packageName && saJson);

  if (haveGoogleCreds) {
    try {
      googleRaw = await fetchGoogleSubscriptionV2({
        packageName,
        token: purchase_token,
        serviceAccountJson: saJson,
      });

      status = mapGoogleStatusToLocal(googleRaw);

      // Intento de extraer expiryTime (si existe)
      const lineItems = Array.isArray(googleRaw?.lineItems) ? googleRaw.lineItems : [];
      for (const li of lineItems) {
        const exp = li?.expiryTime;
        if (typeof exp === "string") {
          current_period_end = exp;
          break;
        }
      }
    } catch (e) {
      // Si Google falla, igual guardamos el intento como pending con raw mínimo
      googleRaw = { error: String(e?.message ?? e) };
      status = "pending";
    }
  }

  // UPSERT billing_subscriptions (backend-only table)
  const { error: upsertErr } = await supabase
    .schema("app")
    .from("billing_subscriptions")
    .upsert(
      {
        org_id,
        platform: "google_play",
        product_id,
        purchase_token,
        status,
        current_period_end,
        raw: googleRaw ?? {},
      },
      { onConflict: "platform,purchase_token" },
    );

  if (upsertErr) {
    return json(500, { error: "billing_subscriptions upsert failed", details: upsertErr.message });
  }

  // Si no tenemos credenciales aún, NO tocamos org_plans
  if (!haveGoogleCreds) {
    return json(200, {
      ok: true,
      mode: "pending_no_google_creds",
      org_id,
      product_id,
      plan_code,
      status,
      note: "Saved as pending; set GOOGLE_PLAY_PACKAGE_NAME and GOOGLE_PLAY_SERVICE_ACCOUNT_JSON to enable verification.",
    });
  }

  // Si ya verificamos y está active, actualizamos org_plans a plan_code.
  // Si no active, regresamos a starter.
  const target_plan = status === "active" ? plan_code : "starter";

  const { error: planErr } = await supabase
    .schema("app")
    .from("org_plans")
    .upsert({ org_id, plan_code: target_plan }, { onConflict: "org_id" });

  if (planErr) {
    return json(500, { error: "org_plans upsert failed", details: planErr.message });
  }

  return json(200, {
    ok: true,
    mode: "verified",
    org_id,
    product_id,
    plan_code: target_plan,
    status,
    current_period_end,
  });
});
