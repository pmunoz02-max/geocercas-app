// api/auth/callback.js
// BACKEND CALLBACK PKCE (TWA/WebView SAFE)
// - Recibe ?code=...&next=/tracker-gps?tg_flow=tracker
// - Intercambia code -> session con Supabase (exchangeCodeForSession)
// - Setea cookies HttpOnly: tg_at, tg_rt
// - Redirige al next final
//
// Env vars requeridas en Vercel:
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//
// Opcional:
//   COOKIE_DOMAIN   (ej: ".tugeocercas.com" si quieres compartir cookies entre subdominios)
//   COOKIE_SECURE_FORCE ("true" para forzar Secure incluso si headers/proxy no lo detectan)

const { createClient } = require("@supabase/supabase-js");

function getEnv(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function safeNext(nextRaw) {
  const next = (nextRaw || "/inicio").trim();

  // Anti open-redirect: SOLO paths relativos
  if (!next.startsWith("/")) return "/inicio";
  if (next.startsWith("//")) return "/inicio";
  // bloquea intentos raros tipo "/\evil"
  if (next.includes("\\") || next.includes("\u0000")) return "/inicio";

  return next;
}

function isSecureRequest(req) {
  const forced = getEnv("COOKIE_SECURE_FORCE");
  if (forced && forced.toLowerCase() === "true") return true;

  const xfProto = (req.headers["x-forwarded-proto"] || "").toString().toLowerCase();
  if (xfProto.includes("https")) return true;

  // fallback
  return false;
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

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      return;
    }

    const SUPABASE_URL = getEnv("SUPABASE_URL");
    const SUPABASE_ANON_KEY = getEnv("SUPABASE_ANON_KEY");
    const COOKIE_DOMAIN = getEnv("COOKIE_DOMAIN"); // optional

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          ok: false,
          error: "Missing env vars",
          details: {
            SUPABASE_URL: Boolean(SUPABASE_URL),
            SUPABASE_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
          },
        }),
      );
      return;
    }

    // Construir URL absoluta para parsear query de forma segura
    const host = req.headers.host || "app.tugeocercas.com";
    const url = new URL(req.url, `https://${host}`);

    const code = url.searchParams.get("code");
    const next = safeNext(url.searchParams.get("next"));

    const secure = isSecureRequest(req);

    // Si no hay code, NO usamos hash (porque no llega al server). Redirigimos a login con error claro.
    if (!code) {
      res.statusCode = 302;
      res.setHeader("Location", `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent("missing_code")}`);
      res.setHeader("Set-Cookie", [
        clearCookie("tg_at", COOKIE_DOMAIN, secure),
        clearCookie("tg_rt", COOKIE_DOMAIN, secure),
      ]);
      res.end();
      return;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, flowType: "pkce" },
    });

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    const at = data?.session?.access_token || null;
    const rt = data?.session?.refresh_token || null;

    if (error || !at || !rt) {
      const msg = error?.message || "exchange_failed";
      res.statusCode = 302;
      res.setHeader("Location", `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(msg)}`);
      res.setHeader("Set-Cookie", [
        clearCookie("tg_at", COOKIE_DOMAIN, secure),
        clearCookie("tg_rt", COOKIE_DOMAIN, secure),
      ]);
      res.end();
      return;
    }

    // TTLs (tu refresh endpoint se encarga de mantener sesión)
    const maxAgeAT = 60 * 60; // 1h
    const maxAgeRT = 60 * 60 * 24 * 30; // 30 días

    res.statusCode = 302;
    res.setHeader("Set-Cookie", [
      makeCookie("tg_at", at, {
        httpOnly: true,
        secure,
        sameSite: "Lax",
        path: "/",
        maxAge: maxAgeAT,
        domain: COOKIE_DOMAIN,
      }),
      makeCookie("tg_rt", rt, {
        httpOnly: true,
        secure,
        sameSite: "Lax",
        path: "/",
        maxAge: maxAgeRT,
        domain: COOKIE_DOMAIN,
      }),
    ]);

    // Redirigir directo al tracker gps
    res.setHeader("Location", next);
    res.end();
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
  }
};
