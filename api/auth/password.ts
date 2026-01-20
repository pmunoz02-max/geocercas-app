import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  runtime: "nodejs",
};

const VERSION = "auth-password-nodejs-v4";
const AUTH_DEBUG = process.env.AUTH_DEBUG === "true";

function debugLog(...args: any[]) {
  if (AUTH_DEBUG) console.log("[AUTH_DEBUG]", ...args);
}

function fail(res: VercelResponse, status: number, error: string, details?: any) {
  return res.status(status).json({ error, details, version: VERSION });
}

function normalizeSupabaseUrl(raw: string) {
  const trimmed = raw.trim();
  // remove surrounding quotes if present
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1).trim()
      : trimmed;

  const startsWithHttps = unquoted.startsWith("https://");
  const includesSupabase = unquoted.includes(".supabase.co");

  let host: string | null = null;
  try {
    host = new URL(unquoted).host;
  } catch {
    host = null;
  }

  return { raw, trimmed, unquoted, startsWithHttps, includesSupabase, host };
}

async function getFetch(): Promise<typeof fetch> {
  if (typeof globalThis.fetch === "function") return globalThis.fetch.bind(globalThis);
  const undici = await import("undici");
  return undici.fetch as any;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");

  const { email, password } = req.body || {};
  if (!email || !password) return fail(res, 400, "Missing email or password");

  const SUPABASE_URL_RAW = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL_RAW) return fail(res, 500, "Missing env var SUPABASE_URL");
  if (!SUPABASE_ANON_KEY) return fail(res, 500, "Missing env var SUPABASE_ANON_KEY");

  const u = normalizeSupabaseUrl(SUPABASE_URL_RAW);

  // Diagnóstico seguro (SUPABASE_URL no es secreto)
  debugLog("SUPABASE_URL diagnostics", {
    rawLen: u.raw.length,
    trimmedLen: u.trimmed.length,
    unquotedLen: u.unquoted.length,
    startsWithHttps: u.startsWithHttps,
    includesSupabase: u.includesSupabase,
    host: u.host,
  });

  if (!u.startsWithHttps || !u.includesSupabase || !u.host) {
    return fail(res, 500, "Invalid SUPABASE_URL format", {
      startsWithHttps: u.startsWithHttps,
      includesSupabase: u.includesSupabase,
      hostParsed: Boolean(u.host),
      // Muestra el URL “limpio” para que puedas comparar (no es secreto)
      normalized: u.unquoted,
    });
  }

  if (!SUPABASE_ANON_KEY.startsWith("eyJ") || SUPABASE_ANON_KEY.length < 100) {
    return fail(res, 500, "Invalid SUPABASE_ANON_KEY format");
  }

  const SUPABASE_URL = u.unquoted;
  const authUrl = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const doFetch = await getFetch();

    const response = await doFetch(authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    let data: any;
    try {
      data = await response.json();
    } catch {
      return fail(res, 502, "Invalid auth response from Supabase");
    }

    if (!response.ok) {
      debugLog("Supabase auth error", { status: response.status, error: data?.error });
      return fail(res, response.status, data?.error || "Authentication failed");
    }

    const { access_token, refresh_token, expires_in, user } = data || {};
    if (!access_token || !refresh_token) return fail(res, 502, "Invalid token payload from Supabase");

    res.setHeader("Set-Cookie", [
      `tg_at=${access_token}; Path=/; HttpOnly; Secure; SameSite=Lax`,
      `tg_rt=${refresh_token}; Path=/; HttpOnly; Secure; SameSite=Lax`,
    ]);

    return res.status(200).json({
      ok: true,
      user_id: user?.id,
      expires_in,
      next: "/inicio",
      version: VERSION,
    });
  } catch (err: any) {
    clearTimeout(timeout);
    debugLog("Auth handler error", { name: err?.name, message: err?.message, cause: err?.cause });
    return fail(res, 502, "Auth service unreachable", err?.message || String(err));
  }
}
