import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  runtime: "nodejs",
};

const VERSION = "auth-password-nodejs-v3";
const AUTH_DEBUG = process.env.AUTH_DEBUG === "true";

function debugLog(...args: any[]) {
  if (AUTH_DEBUG) console.log("[AUTH_DEBUG]", ...args);
}

function fail(res: VercelResponse, status: number, error: string, details?: any) {
  return res.status(status).json({ error, details, version: VERSION });
}

async function getFetch(): Promise<typeof fetch> {
  // Prefer the native fetch (Node 18/20 on Vercel)
  if (typeof globalThis.fetch === "function") return globalThis.fetch.bind(globalThis);

  // Fallback (only if needed) — will NOT crash at startup
  try {
    const undici = await import("undici");
    if (typeof undici.fetch === "function") return undici.fetch as any;
  } catch (e: any) {
    // If undici isn't installed, we handle it gracefully
    throw new Error("No fetch available (native fetch missing and undici not installed)");
  }

  throw new Error("No fetch available");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");

  const { email, password } = req.body || {};
  if (!email || !password) return fail(res, 400, "Missing email or password");

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  // Fail-fast env vars
  if (!SUPABASE_URL) return fail(res, 500, "Missing env var SUPABASE_URL");
  if (!SUPABASE_URL.startsWith("https://") || !SUPABASE_URL.includes(".supabase.co")) {
    return fail(res, 500, "Invalid SUPABASE_URL format");
  }
  if (!SUPABASE_ANON_KEY) return fail(res, 500, "Missing env var SUPABASE_ANON_KEY");
  if (!SUPABASE_ANON_KEY.startsWith("eyJ") || SUPABASE_ANON_KEY.length < 100) {
    return fail(res, 500, "Invalid SUPABASE_ANON_KEY format");
  }

  debugLog("Env vars OK", {
    supabaseHost: new URL(SUPABASE_URL).host,
    anonKeyLength: SUPABASE_ANON_KEY.length,
  });

  const authUrl = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;

  // Timeout
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

    let data: any = null;
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

    // Cookies HttpOnly
    res.setHeader("Set-Cookie", [
      `tg_at=${access_token}; Path=/; HttpOnly; Secure; SameSite=Lax`,
      `tg_rt=${refresh_token}; Path=/; HttpOnly; Secure; SameSite=Lax`,
    ]);

    debugLog("Login OK", { user_id: user?.id, expires_in });

    return res.status(200).json({
      ok: true,
      user_id: user?.id,
      expires_in,
      next: "/inicio",
      version: VERSION,
    });
  } catch (err: any) {
    clearTimeout(timeout);

    debugLog("Auth handler error", {
      name: err?.name,
      message: err?.message,
      cause: err?.cause,
    });

    // When the function crashes previously, now it should return JSON
    return fail(res, 502, "Auth service unreachable", err?.message || String(err));
  }
}
