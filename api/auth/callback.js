// api/auth/callback.js
// Backend callback PKCE (TWA/WebView SAFE)
// - Recibe ?code=...&next=/tracker-gps?tg_flow=tracker
// - exchangeCodeForSession(code) con Supabase
// - Set cookies HttpOnly: tg_at, tg_rt
// - Redirect a next (solo paths relativos)

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

export default async function handler(req, res) {
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

    const secure = isSecure(req);
    const COOKIE_DOMAIN = env("COOKIE_DOMAIN"); // opcional: ".tugeocercas.com"

    // Limpia cookies si el flujo viene mal
    const clearCookies = [
      clearCookie("tg_at", COOKIE_DOMAIN, secure),
      clearCookie("tg_rt", COOKIE_DOMAIN, secure),
    ];

    if (!code) {
      res.statusCode = 302;
      res.setHeader("Set-Cookie", clearCookies);
      res.setHeader("Location", `/login?next=${encodeURIComponent(next)}&err=missing_code`);
      res.end();
      return;
    }

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

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    const at = data?.session?.access_token || null;
    const rt = data?.session?.refresh_token || null;

    if (error || !at || !rt) {
      const msg = encodeURIComponent(error?.message || "exchange_failed");
      res.statusCode = 302;
      res.setHeader("Set-Cookie", clearCookies);
      res.setHeader("Location", `/login?next=${encodeURIComponent(next)}&err=${msg}`);
      res.end();
      return;
    }

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

    // Redirige directo al tracker
    res.setHeader("Location", next);
    res.end();
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, stage: "fatal", error: e?.message || String(e) }));
  }
}
