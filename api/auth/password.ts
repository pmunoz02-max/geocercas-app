/* api/auth/password.ts
 * AUTH – Ruta B (API-first con cookies)
 * Runtime: Node.js (forzado)
 * Nunca debe crashear con GET
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

/* 🔒 FORZAR RUNTIME NODE.JS (CRÍTICO) */
export const config = {
  runtime: "nodejs",
};

/* =========================
   Helpers
========================= */

function makeCookie(
  name: string,
  value: string,
  opts: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Lax" | "Strict" | "None";
    path?: string;
    maxAge?: number;
  } = {}
) {
  const {
    httpOnly = true,
    secure = true,
    sameSite = "Lax",
    path = "/",
    maxAge,
  } = opts;

  let c = `${name}=${encodeURIComponent(value)}`;
  if (path) c += `; Path=${path}`;
  if (typeof maxAge === "number") c += `; Max-Age=${maxAge}`;
  if (sameSite) c += `; SameSite=${sameSite}`;
  if (secure) c += `; Secure`;
  if (httpOnly) c += `; HttpOnly`;
  return c;
}

async function readJson(req: VercelRequest): Promise<any> {
  if (req.body && typeof req.body === "object") return req.body;

  const raw = await new Promise<string>((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });

  if (!raw) return {};
  return JSON.parse(raw);
}

/* =========================
   Handler
========================= */

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const VERSION = "auth-password-nodejs-v1";

  try {
    /* ---- CORS mínimo (same-origin) ---- */
    const origin = req.headers.origin;
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");

    if (req.method === "OPTIONS") {
      res.status(200).end();
      return;
    }

    /* ---- BLOQUEO DE MÉTODO (NUNCA 500) ---- */
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST,OPTIONS");
      res.status(405).send("Method Not Allowed");
      return;
    }

    /* ---- ENV ---- */
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      res.status(500).json({
        error: "Server misconfigured",
        details: "Missing SUPABASE_URL or SUPABASE_ANON_KEY",
        version: VERSION,
      });
      return;
    }

    /* ---- BODY ---- */
    let body: any = {};
    try {
      body = await readJson(req);
    } catch {
      res.status(400).json({
        error: "Invalid JSON body",
        version: VERSION,
      });
      return;
    }

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const next = String(body.next || "/");

    if (!email || !password) {
      res.status(400).json({
        error: "Email and password required",
        version: VERSION,
      });
      return;
    }

    /* ---- SUPABASE PASSWORD GRANT ---- */
    const tokenUrl =
      SUPABASE_URL.replace(/\/$/, "") +
      "/auth/v1/token?grant_type=password";

    let data: any;
    try {
      const r = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email, password }),
      });

      const text = await r.text();
      data = text ? JSON.parse(text) : null;

      if (!r.ok || !data?.access_token) {
        res.status(401).json({
          error: "Invalid credentials",
          version: VERSION,
        });
        return;
      }
    } catch (e: any) {
      res.status(502).json({
        error: "Auth service unreachable",
        details: String(e?.message || e),
        version: VERSION,
      });
      return;
    }

    /* ---- COOKIES (Ruta B) ---- */
    const accessToken = data.access_token;
    const refreshToken = data.refresh_token || "";
    const accessMaxAge = Number(data.expires_in || 3600);
    const refreshMaxAge = 30 * 24 * 60 * 60;

    res.setHeader("Set-Cookie", [
      makeCookie("tg_at", accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/",
        maxAge: accessMaxAge,
      }),
      makeCookie("tg_rt", refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/",
        maxAge: refreshMaxAge,
      }),
    ]);

    /* ---- RESPUESTA JSON (frontend maneja navegación) ---- */
    res.status(200).json({
      ok: true,
      user_id: data.user?.id || null,
      expires_in: data.expires_in,
      next,
      version: VERSION,
    });
  } catch (fatal: any) {
    /* ---- ÚLTIMA BARRERA: JAMÁS CRASH ---- */
    console.error("[api/auth/password] fatal:", fatal);
    res.status(500).json({
      error: "Unexpected server error",
      version: "auth-password-nodejs-v1",
    });
  }
}
