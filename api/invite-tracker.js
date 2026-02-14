// api/invite-tracker.js
// Preview-only safe proxy for calling Supabase Edge Function invite_tracker
// Adds build_tag + always returns diagnostics on 401 to avoid guesswork.

const BUILD_TAG = "invite-proxy-v2-20260214";

function getCookie(req, name) {
  const raw = req?.headers?.cookie || "";
  const parts = raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  const hit = parts.find((p) => p.startsWith(name + "="));
  if (!hit) return "";
  const value = hit.split("=").slice(1).join("=");
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeToken(maybeToken) {
  let t = String(maybeToken || "").trim();

  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  if (t.startsWith("s:")) t = t.slice(2).trim();
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, "").trim();
  t = t.replace(/\s+/g, "");
  return t;
}

function base64UrlDecode(str) {
  let s = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  return Buffer.from(s, "base64").toString("utf8");
}

function tryDecodeJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return { ok: false, error: "JWT_NOT_3_PARTS" };
  try {
    const header = JSON.parse(base64UrlDecode(parts[0]));
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return { ok: true, header, payload };
  } catch (e) {
    return { ok: false, error: "JWT_DECODE_FAILED", details: String(e?.message || e) };
  }
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function expectedPreviewRef() {
  return "mujwsfhkocsuuahlrssn";
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "authorization, x-client-info, apikey, content-type"
      );
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      return res.status(200).send("ok");
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, build_tag: BUILD_TAG, error: "Method not allowed" });
    }

    const vercelEnv = String(process.env.VERCEL_ENV || "").toLowerCase();
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    const tgAtRaw = getCookie(req, "tg_at");
    const tgAt = normalizeToken(tgAtRaw);

    if (!tgAt) {
      return res.status(401).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "Missing tg_at cookie",
        diag: { vercelEnv, hasSupabaseUrl: !!supabaseUrl, hasAnonKey: !!anonKey },
      });
    }

    if (!supabaseUrl || !anonKey) {
      return res.status(500).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "Server missing SUPABASE env (URL/ANON)",
        diag: { vercelEnv, hasSupabaseUrl: !!supabaseUrl, hasAnonKey: !!anonKey, supabaseUrl },
      });
    }

    const decoded = tryDecodeJwt(tgAt);
    if (!decoded.ok) {
      return res.status(401).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "MALFORMED_JWT",
        details: decoded,
        diag: { vercelEnv, supabaseUrl },
      });
    }

    const { payload } = decoded;
    const iss = payload?.iss ? String(payload.iss) : "";
    const exp = payload?.exp ? Number(payload.exp) : null;
    const aud = payload?.aud ?? null;
    const now = nowUnix();

    if (typeof exp === "number" && exp > 0 && exp <= now) {
      return res.status(401).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "EXPIRED_JWT",
        diag: { vercelEnv, supabaseUrl, iss, aud, exp, now },
      });
    }

    // Preview guardrail: avoid mixing prod token/env with preview project
    if (vercelEnv === "preview") {
      const ref = expectedPreviewRef();
      const urlHasRef = String(supabaseUrl).includes(ref);
      const issHasRef = iss.includes(ref);

      if (!urlHasRef || (iss && !issHasRef)) {
        return res.status(401).json({
          ok: false,
          build_tag: BUILD_TAG,
          error: "PREVIEW_PROJECT_MISMATCH",
          message:
            "Token/ENV do not match preview Supabase project. Likely tg_at from another project (prod) or SUPABASE_URL points elsewhere.",
          diag: { vercelEnv, expected_ref: ref, supabaseUrl, iss, aud, exp, now },
        });
      }
    }

    const url = String(supabaseUrl).replace(/\/$/, "") + "/functions/v1/invite_tracker";

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${tgAt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body || {}),
    });

    const text = await upstream.text();

    let upstreamJson = null;
    try {
      upstreamJson = text ? JSON.parse(text) : null;
    } catch {
      upstreamJson = { raw: text };
    }

    // Always wrap 401 with diagnostics (so we stop guessing)
    if (upstream.status === 401) {
      return res.status(401).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "UPSTREAM_401",
        upstream: upstreamJson,
        diag: { vercelEnv, supabaseUrl, iss, aud, exp, now },
      });
    }

    // Pass-through other statuses but keep build_tag
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "UPSTREAM_ERROR",
        upstream_status: upstream.status,
        upstream: upstreamJson,
      });
    }

    // Success
    return res.status(200).json({
      build_tag: BUILD_TAG,
      ...upstreamJson,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, build_tag: BUILD_TAG, error: String(e?.message || e) });
  }
}
