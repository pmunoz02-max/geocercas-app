// api/invite-tracker.ts
// Proxy API-first: Browser -> Vercel (cookies tg_at/tg_rt) -> Supabase Edge Function invite_tracker
// Nunca crashear, siempre JSON.

import type { VercelRequest, VercelResponse } from "@vercel/node";

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  const parts = cookieHeader.split(";");
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i === -1) continue;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function makeCookie(
  name: string,
  value: string,
  opts: { httpOnly?: boolean; secure?: boolean; sameSite?: "Lax" | "Strict" | "None"; path?: string; maxAge?: number } = {}
) {
  const {
    httpOnly = true,
    secure = true,
    sameSite = "Lax",
    path = "/",
    maxAge,
  } = opts;

  let s = `${name}=${encodeURIComponent(value ?? "")}`;
  if (path) s += `; Path=${path}`;
  if (typeof maxAge === "number") s += `; Max-Age=${maxAge}`;
  if (sameSite) s += `; SameSite=${sameSite}`;
  if (secure) s += `; Secure`;
  if (httpOnly) s += `; HttpOnly`;
  return s;
}

async function readJsonBody(req: VercelRequest): Promise<any> {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) return JSON.parse(req.body);

  const raw = await new Promise<string>((resolve) => {
    let data = "";
    (req as any).on("data", (c: any) => (data += c));
    (req as any).on("end", () => resolve(data));
  });

  if (!raw || !raw.trim()) return {};
  return JSON.parse(raw);
}

async function refreshAccessToken(args: { supabaseUrl: string; anonKey: string; refreshToken: string }) {
  const { supabaseUrl, anonKey, refreshToken } = args;
  const url = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const text = await r.text();
  const json = text ? JSON.parse(text) : {};

  if (!r.ok || !json?.access_token) {
    const msg = json?.error_description || json?.error || "Failed to refresh token";
    const err: any = new Error(msg);
    err.status = 401;
    err.body = json || null;
    throw err;
  }

  return json as { access_token: string; refresh_token?: string; expires_in?: number };
}

function sendJson(res: VercelResponse, status: number, payload: any) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const version = "invite-tracker-proxy-ts-v1-2026-01-22";

  try {
    // CORS
    const origin = req.headers.origin as string | undefined;
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");

    if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true, version });

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST,OPTIONS");
      return sendJson(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED", version });
    }

    const SUPABASE_URL =
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const SUPABASE_ANON_KEY =
      process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return sendJson(res, 500, {
        ok: false,
        error: "SERVER_MISCONFIGURED",
        details: "Missing SUPABASE_URL or SUPABASE_ANON_KEY",
        version,
      });
    }

    let body: any = {};
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { ok: false, error: "INVALID_JSON_BODY", version });
    }

    const email = String(body?.email || "").trim().toLowerCase();
    const org_id = String(body?.org_id || "").trim();
    const person_id = String(body?.person_id || "").trim();

    if (!email || !email.includes("@") || !org_id || !person_id) {
      return sendJson(res, 400, {
        ok: false,
        error: "MISSING_FIELDS",
        required: ["email", "org_id", "person_id"],
        version,
      });
    }

    const cookies = parseCookies(req.headers.cookie as string | undefined);
    let accessToken = cookies.tg_at || "";
    const refreshToken = cookies.tg_rt || "";

    if (!accessToken) {
      if (!refreshToken) {
        return sendJson(res, 401, { ok: false, error: "MISSING_TG_AT", version });
      }
      const refreshed = await refreshAccessToken({
        supabaseUrl: SUPABASE_URL,
        anonKey: SUPABASE_ANON_KEY,
        refreshToken,
      });

      accessToken = refreshed.access_token;

      res.setHeader("Set-Cookie", [
        makeCookie("tg_at", refreshed.access_token, { maxAge: Number(refreshed.expires_in || 3600) }),
        makeCookie("tg_rt", refreshed.refresh_token || refreshToken, { maxAge: 30 * 24 * 60 * 60 }),
      ]);
    }

    const fnUrl = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/invite_tracker`;

    const fnRes = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ email, org_id, person_id }),
    });

    const text = await fnRes.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text ? { raw: text } : null;
    }

    return sendJson(res, fnRes.status, {
      ok: fnRes.ok,
      data,
      version,
    });
  } catch (e: any) {
    console.error("[api/invite-tracker] fatal:", e);
    return sendJson(res, e?.status || 500, {
      ok: false,
      error: "SERVER_ERROR",
      message: e?.message || String(e),
      details: e?.body || null,
      version,
    });
  }
}
