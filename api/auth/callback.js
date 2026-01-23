// api/auth/callback.js
export const config = { runtime: "nodejs" };

function env(n) {
  const v = process.env[n];
  return v && v.trim() ? v.trim() : null;
}

function safePath(p) {
  const x = (p || "").trim();
  if (!x) return null;
  if (!x.startsWith("/") || x.startsWith("//")) return null;
  if (x.includes("\\") || x.includes("\u0000")) return null;
  return x;
}

function isSecure(req) {
  const xf = (req.headers["x-forwarded-proto"] || "").toString().toLowerCase();
  return xf.includes("https");
}

function cookie(name, value, { domain, secure, maxAge }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  if (domain) parts.push(`Domain=${domain}`);
  if (typeof maxAge === "number") parts.push(`Max-Age=${maxAge}`);
  return parts.join("; ");
}

function clearCookie(name, { domain, secure }) {
  return cookie(name, "", { domain, secure, maxAge: 0 });
}

function normalizeType(t) {
  const x = String(t || "").trim().toLowerCase();
  const allowed = new Set(["invite", "magiclink", "recovery", "email_change", "signup"]);
  return allowed.has(x) ? x : null;
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

    const code = url.searchParams.get("code");
    const token_hash = url.searchParams.get("token_hash");
    const typeFromUrl = normalizeType(url.searchParams.get("type"));

    // ✅ next: si no viene, y es invite/magiclink -> tracker por defecto
    const nextRaw = safePath(url.searchParams.get("next"));
    const defaultTracker = "/tracker-gps?tg_flow=tracker";
    const next =
      nextRaw ||
      (token_hash && (typeFromUrl === "invite" || typeFromUrl === "magiclink") ? defaultTracker : "/inicio");

    const SUPABASE_URL = env("SUPABASE_URL");
    const SUPABASE_ANON_KEY = env("SUPABASE_ANON_KEY");
    const COOKIE_DOMAIN = env("COOKIE_DOMAIN") || null;
    const secure = isSecure(req);

    const clear = [
      clearCookie("tg_at", { domain: COOKIE_DOMAIN, secure }),
      clearCookie("tg_rt", { domain: COOKIE_DOMAIN, secure }),
    ];

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      res.statusCode = 302;
      res.setHeader("Set-Cookie", clear);
      res.setHeader("Location", `/login?err=missing_env`);
      res.end();
      return;
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, flowType: "pkce" },
    });

    let session = null;

    // 1) Web PKCE normal
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      session = data?.session || null;
      console.log("[CALLBACK]", { trace, mode: "code", ok: !!session, next });
    }
    // 2) Email token_hash (invite/magiclink/etc) -> verifyOtp robusto
    else if (token_hash) {
      const candidates = [];
      if (typeFromUrl) candidates.push(typeFromUrl);
      candidates.push("magiclink", "invite", "signup");

      let lastErr = null;

      for (const t of candidates) {
        try {
          const { data, error } = await supabase.auth.verifyOtp({ type: t, token_hash });
          if (error) throw error;
          if (data?.session?.access_token && data?.session?.refresh_token) {
            session = data.session;
            console.log("[CALLBACK]", { trace, mode: "token_hash", ok: true, type_used: t, next });
            break;
          }
        } catch (e) {
          lastErr = e;
          console.log("[CALLBACK]", { trace, mode: "token_hash", ok: false, type_try: t, err: e?.message || String(e) });
        }
      }

      if (!session) {
        const msg = encodeURIComponent(lastErr?.message || "Email link is invalid or has expired");
        res.statusCode = 302;
        res.setHeader("Set-Cookie", clear);
        res.setHeader("Location", `/login?err=${msg}`);
        res.end();
        return;
      }
    } else {
      res.statusCode = 302;
      res.setHeader("Set-Cookie", clear);
      res.setHeader("Location", `/login?err=missing_code_or_token_hash`);
      res.end();
      return;
    }

    if (!session?.access_token || !session?.refresh_token) {
      res.statusCode = 302;
      res.setHeader("Set-Cookie", clear);
      res.setHeader("Location", `/login?err=no_session`);
      res.end();
      return;
    }

    res.statusCode = 302;
    res.setHeader("Set-Cookie", [
      cookie("tg_at", session.access_token, { domain: COOKIE_DOMAIN, secure, maxAge: 60 * 60 }),
      cookie("tg_rt", session.refresh_token, { domain: COOKIE_DOMAIN, secure, maxAge: 60 * 60 * 24 * 30 }),
    ]);
    res.setHeader("Location", next);
    res.end();
  } catch (e) {
    const msg = encodeURIComponent(e?.message || "auth_failed");
    console.log("[CALLBACK_FATAL]", { trace, err: e?.message || String(e) });
    res.statusCode = 302;
    res.setHeader("Location", `/login?err=${msg}`);
    res.end();
  }
}
