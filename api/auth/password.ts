// api/auth/password.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY!;

function setCookie(res: VercelResponse, name: string, value: string, maxAge: number) {
  res.setHeader("Set-Cookie", [
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
  ]);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const accept = String(req.headers.accept || "");
  const wantsHTML = accept.includes("text/html");

  const { email, password, next = "/inicio" } = req.body || {};

  if (!email || !password) {
    if (wantsHTML) {
      res.redirect(302, `/login?error=missing_credentials`);
    } else {
      res.status(400).json({ ok: false, error: "Missing credentials" });
    }
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    if (wantsHTML) {
      res.redirect(302, `/login?error=invalid_credentials`);
    } else {
      res.status(401).json({ ok: false, error: error?.message || "Invalid login" });
    }
    return;
  }

  const { access_token, refresh_token, expires_in, user } = data.session;

  // Cookies HttpOnly (Ruta B)
  setCookie(res, "tg_at", access_token, expires_in);
  setCookie(res, "tg_rt", refresh_token, 60 * 60 * 24 * 30);

  if (wantsHTML) {
    // 🔑 LOGIN NO-JS → REDIRECT
    res.redirect(302, next);
  } else {
    // 🔑 LOGIN JS → JSON
    res.status(200).json({
      ok: true,
      user_id: user.id,
      expires_in,
      next,
      version: "auth-password-nodejs-v6",
    });
  }
}
