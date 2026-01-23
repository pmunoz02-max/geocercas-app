// api/auth/callback.js
export const config = { runtime: "nodejs" };

function env(n) {
  const v = process.env[n];
  return v && v.trim() ? v.trim() : null;
}

function safeNext(n) {
  if (!n || !n.startsWith("/") || n.startsWith("//")) return "/inicio";
  return n;
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const next = safeNext(url.searchParams.get("next"));
    const code = url.searchParams.get("code");
    const token_hash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type");

    const SUPABASE_URL = env("SUPABASE_URL");
    const SUPABASE_ANON_KEY = env("SUPABASE_ANON_KEY");
    const COOKIE_DOMAIN = env("COOKIE_DOMAIN");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      res.writeHead(302, { Location: `/login?err=missing_env` });
      return res.end();
    }

    const { createClient } = await import("@supabase/supabase-js");

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, flowType: "pkce" },
    });

    let session = null;

    // 🔑 CASO 1: PKCE con code
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      session = data.session;
    }

    // 🔑 CASO 2: token_hash PKCE (invite)
    else if (token_hash && token_hash.startsWith("pkce_")) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(token_hash);
      if (error) throw error;
      session = data.session;
    }

    // 🔑 CASO 3: OTP clásico
    else if (token_hash) {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash,
        type,
      });
      if (error) throw error;
      session = data.session;
    }

    if (!session?.access_token || !session?.refresh_token) {
      throw new Error("no_session");
    }

    res.setHeader("Set-Cookie", [
      `tg_at=${session.access_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Domain=${COOKIE_DOMAIN}`,
      `tg_rt=${session.refresh_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Domain=${COOKIE_DOMAIN}`,
    ]);

    res.writeHead(302, { Location: next });
    res.end();
  } catch (e) {
    res.writeHead(302, {
      Location: `/login?err=${encodeURIComponent(e.message || "auth_failed")}`,
    });
    res.end();
  }
}
