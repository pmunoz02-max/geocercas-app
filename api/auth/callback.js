// api/auth/callback.js
// Backend callback (TWA/WebView SAFE)
// Soporta:
//  - PKCE:      ?code=...&next=/tracker-gps?tg_flow=tracker
//  - token_hash ?token_hash=...&type=invite|magiclink|recovery|email_change&next=...

export const config = { runtime: "nodejs" };

function env(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function safeNext(nextRaw) {
  const next = (nextRaw || "/inicio").trim();
  if (!next.startsWith("/")) return "/inicio";
  if (next.startsWith("//")) return "/inicio";
  if (next.includes("\\") || next.includes("\u0000")) return "/inicio";
  return next;
}

function isSecure(req) {
  const forced = env("COOKIE_SECURE_FORCE");
  if (forced && forced.toLowerCase() === "true") return true;
  const xf = (req.headers["x-forwarded-proto"] || "").toString().toLowerCase();
  return xf.includes("https");
}

function makeCookie(name, value, opts) {
  const parts = [];
  parts.push(`${name}=${encodeURIComponent(value)}`);
  parts.push(`Path=${opts.path || "/"}`);
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  parts.push(`SameSite=${opts.sameSite || "Lax"}`);
  return parts.join("; ");
}

function clearCookie(name, domain, secure) {
  return makeCookie(name, "", {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: 0,
    domain,
  });
}

function normalizeOtpType(typeRaw) {
  const t = String(typeRaw || "").trim().toLowerCase();
  // Tipos soportados por Supabase verifyOtp en JS v2 (y los más comunes en emails)
  const allowed = new Set(["invite", "magiclink", "recovery", "email_change", "signup"]);
  return allowed.has(t) ? t : null;
}

export default async function handler(req, res) {
  const trace = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      return;
    }

    const host = req.headers.host || "app.tugeocercas.com";
    const url = new URL(req.url, `https://${host}`);

    const next = safeNext(url.searchParams.get("next"));
    const code = url.searchParams.get("code");
    const token_hash = url.searchParams.get("token_hash");
    const typeRaw = url.searchParams.get("type");

    const secure = isSecure(req);
    const COOKIE_DOMAIN = env("COOKIE_DOMAIN"); // opcional: ".tugeocercas.com"

    const clearCookies = [
      clearCookie("tg_at", COOKIE_DOMAIN, secure),
      clearCookie("tg_rt", COOKIE_DOMAIN, secure),
    ];

    const SUPABASE_URL = env("SUPABASE_URL");
    const SUPABASE_ANON_KEY = env("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      res.statusCode = 302;
      res.setHeader("Set-Cookie", clearCookies);
      res.setHeader("Location", `/login?next=${encodeURIComponent(next)}&err=missing_env`);
      res.end();
      return;
    }

    // Import dinámico (evita edge-cases de bundling)
    const { createClient } = await import("@supabase/supabase-js");

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, flowType: "pkce" },
    });

    let at = null;
    let rt = null;

    // 1) PKCE code flow
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      at = data?.session?.access_token || null;
      rt = data?.session?.refresh_token || null;

      if (error || !at || !rt) {
        const msg = encodeURIComponent(error?.message || "exchange_failed");
        console.log("[CALLBACK]", { trace, mode: "code", ok: false, err: error?.message || "no_session" });
        res.statusCode = 302;
        res.setHeader("Set-Cookie", clearCookies);
        res.setHeader("Location", `/login?next=${encodeURIComponent(next)}&err=${msg}`);
        res.end();
        return;
      }

      console.log("[CALLBACK]", { trace, mode: "code", ok: true, next });
    }
    // 2) token_hash flow (invite/magiclink/etc)
    else if (token_hash) {
      const type = normalizeOtpType(typeRaw);
      if (!type) {
        console.log("[CALLBACK]", { trace, mode: "token_hash", ok: false, err: "invalid_type", typeRaw });
        res.statusCode = 302;
        res.setHeader("Set-Cookie", clearCookies);
        res.setHeader("Location", `/login?next=${encodeURIComponent(next)}&err=invalid_type`);
        res.end();
        return;
      }

      const { data, error } = await supabase.auth.verifyOtp({
        type,
        token_hash,
      });

      at = data?.session?.access_token || null;
      rt = data?.session?.refresh_token || null;

      if (error || !at || !rt) {
        const msg = encodeURIComponent(error?.message || "verify_failed");
        console.log("[CALLBACK]", { trace, mode: "token_hash", ok: false, err: error?.message || "no_session", type });
        res.statusCode = 302;
        res.setHeader("Set-Cookie", clearCookies);
        res.setHeader("Location", `/login?next=${encodeURIComponent(next)}&err=${msg}`);
        res.end();
        return;
      }

      console.log("[CALLBACK]", { trace, mode: "token_hash", ok: true, type, next });
    } else {
      // no code, no token_hash
      console.log("[CALLBACK]", { trace, ok: false, err: "missing_code_or_token_hash" });
      res.statusCode = 302;
      res.setHeader("Set-Cookie", clearCookies);
      res.setHeader("Location", `/login?next=${encodeURIComponent(next)}&err=missing_code_or_token_hash`);
      res.end();
      return;
    }

    // Set cookies HttpOnly (API-first)
    res.statusCode = 302;
    res.setHeader("Set-Cookie", [
      makeCookie("tg_at", at, {
        httpOnly: true,
        secure,
        sameSite: "Lax",
        path: "/",
        maxAge: 60 * 60, // 1h
        domain: COOKIE_DOMAIN,
      }),
      makeCookie("tg_rt", rt, {
        httpOnly: true,
        secure,
        sameSite: "Lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30d
        domain: COOKIE_DOMAIN,
      }),
    ]);

    // Redirige directo al tracker (no /login)
    res.setHeader("Location", next);
    res.end();
  } catch (e) {
    console.log("[CALLBACK_FATAL]", { error: e?.message || String(e) });
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, stage: "fatal", error: e?.message || String(e) }));
  }
}
