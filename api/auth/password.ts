import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { runtime: "nodejs" };

const VERSION = "auth-password-nodejs-v5";
const AUTH_DEBUG = process.env.AUTH_DEBUG === "true";

function debugLog(...args: any[]) {
  if (AUTH_DEBUG) console.log("[AUTH_DEBUG]", ...args);
}

function fail(res: VercelResponse, status: number, error: string, details?: any) {
  return res.status(status).json({ error, details, version: VERSION });
}

function normalizeUrl(raw: string) {
  const trimmed = raw.trim();
  const unquoted =
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
      ? trimmed.slice(1, -1).trim()
      : trimmed;

  let hostOk = false;
  try {
    hostOk = Boolean(new URL(unquoted).host);
  } catch {
    hostOk = false;
  }

  const startsWithHttps = unquoted.startsWith("https://");
  const includesSupabase = unquoted.includes(".supabase.co");

  return { url: unquoted, startsWithHttps, includesSupabase, hostOk };
}

async function getFetch(): Promise<typeof fetch> {
  if (typeof globalThis.fetch === "function") return globalThis.fetch.bind(globalThis);
  const undici = await import("undici");
  return undici.fetch as any;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");

  const email = (req.body?.email ?? "").toString().trim();
  const password = (req.body?.password ?? "").toString();

  if (!email || !password) return fail(res, 400, "Missing email or password");

  const SUPABASE_URL_RAW = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL_RAW) return fail(res, 500, "Missing env var SUPABASE_URL");
  if (!SUPABASE_ANON_KEY) return fail(res, 500, "Missing env var SUPABASE_ANON_KEY");

  const u = normalizeUrl(SUPABASE_URL_RAW);
  if (!u.startsWithHttps || !u.includesSupabase || !u.hostOk) {
    return fail(res, 500, "Invalid SUPABASE_URL format");
  }

  if (!SUPABASE_ANON_KEY.startsWith("eyJ") || SUPABASE_ANON_KEY.length < 100) {
    return fail(res, 500, "Invalid SUPABASE_ANON_KEY format");
  }

  const authUrl = `${u.url}/auth/v1/token?grant_type=password`;

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
      const msg =
        data?.error_description ||
        data?.msg ||
        data?.error ||
        "Authentication failed";

      debugLog("Supabase auth error", {
        status: response.status,
        error: data?.error,
        error_description: data?.error_description,
      });

      // Mantén el mensaje, pero sin detalles sensibles
      return fail(res, response.status, msg);
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

    debugLog("Fetch/handler error", {
      name: err?.name,
      message: err?.message,
      cause: err?.cause,
    });

    return fail(res, 502, "Auth service unreachable", err?.message || String(err));
  }
}
