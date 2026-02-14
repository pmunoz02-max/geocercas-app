// api/invite-tracker.js
// Preview-only safe proxy for calling Supabase Edge Function invite_tracker
// - Reads HttpOnly cookie tg_at
// - Validates JWT shape and provides actionable diagnostics
// - Prevents cross-project token/env mix in Vercel Preview

function getCookie(req, name) {
  const raw = req?.headers?.cookie || "";
  const parts = raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  const hit = parts.find((p) => p.startsWith(name + "="));
  if (!hit) return "";

  // keep everything after first "=" (in case value contains "=")
  const value = hit.split("=").slice(1).join("=");
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeToken(maybeToken) {
  let t = String(maybeToken || "").trim();

  // common wrappers
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }

  // sometimes cookies are signed like: s:<value>
  if (t.startsWith("s:")) t = t.slice(2).trim();

  // sometimes token is stored as "Bearer <jwt>"
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, "").trim();

  // remove accidental whitespace
  t = t.replace(/\s+/g, "");

  return t;
}

function base64UrlDecode(str) {
  // base64url -> base64
  let s = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  // pad
  while (s.length % 4 !== 0) s += "=";

  // Node.js decode
  return Buffer.from(s, "base64").toString("utf8");
}

function tryDecodeJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    return { ok: false, error: "JWT_NOT_3_PARTS" };
  }
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
  // hard guardrail for THIS project preview
  return "mujwsfhkocsuuahlrssn";
}

export default async function handler(req, res) {
  try {
    // CORS for OPTIONS (mostly irrelevant for same-origin, but harmless)
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
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    // 1) Get and normalize tg_at
    const tgAtRaw = getCookie(req, "tg_at");
    const tgAt = normalizeToken(tgAtRaw);

    if (!tgAt) {
      return res.status(401).json({ ok: false, error: "Missing tg_at cookie" });
    }

    // 2) Read server env only (prefer SUPABASE_URL/ANON_KEY, fallback to VITE_* if you really set them server-side)
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return res.status(500).json({
        ok: false,
        error: "Server missing SUPABASE env (URL/ANON)",
        hasUrl: Boolean(supabaseUrl),
        hasAnon: Boolean(anonKey),
      });
    }

    // 3) Decode JWT (diagnostic)
    const decoded = tryDecodeJwt(tgAt);
    if (!decoded.ok) {
      return res.status(401).json({
        ok: false,
        error: "MALFORMED_JWT",
        details: decoded,
      });
    }

    const { payload } = decoded;
    const iss = payload?.iss ? String(payload.iss) : "";
    const exp = payload?.exp ? Number(payload.exp) : null;
    const aud = payload?.aud ?? null;

    // 4) Expiry check
    const now = nowUnix();
    if (typeof exp === "number" && exp > 0 && exp <= now) {
      return res.status(401).json({
        ok: false,
        error: "EXPIRED_JWT",
        exp,
        now,
        iss,
        aud,
      });
    }

    // 5) Preview guardrail: avoid mixing prod token/env with preview project
    //    (This is universal + permanent safety to stop silent cross-env mistakes)
    const vercelEnv = String(process.env.VERCEL_ENV || "").toLowerCase(); // "preview" | "production" | "development"
    if (vercelEnv === "preview") {
      const ref = expectedPreviewRef();
      const urlStr = String(supabaseUrl);
      const urlHasRef = urlStr.includes(ref);
      const issHasRef = iss.includes(ref);

      if (!urlHasRef || (iss && !issHasRef)) {
        return res.status(401).json({
          ok: false,
          error: "PREVIEW_PROJECT_MISMATCH",
          message:
            "Token/ENV do not match preview Supabase project. Likely tg_at from another project (prod) or SUPABASE_URL points elsewhere.",
          expected_ref: ref,
          supabaseUrl,
          iss,
          aud,
          exp,
          now,
        });
      }
    }

    // 6) Call Edge Function
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
    res.status(upstream.status);

    // If upstream says Invalid JWT, include minimal diagnostics (no token leakage)
    if (upstream.status === 401) {
      // try parse upstream json message
      let upstreamJson = null;
      try {
        upstreamJson = text ? JSON.parse(text) : null;
      } catch {
        upstreamJson = { raw: text };
      }

      return res.json({
        ok: false,
        error: "UPSTREAM_401",
        upstream: upstreamJson,
        diag: {
          vercelEnv,
          supabaseUrl,
          iss,
          aud,
          exp,
          now,
        },
      });
    }

    // normal return
    try {
      const json = text ? JSON.parse(text) : null;
      return res.json(json);
    } catch {
      return res.send(text);
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
