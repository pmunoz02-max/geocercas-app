// api/auth/recovery.js
import { createClient } from "@supabase/supabase-js";

export const config = {
  runtime: "nodejs",
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function isStrongEnough(pw) {
  const s = String(pw || "");
  return s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY =
      process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
      return json(res, 500, {
        ok: false,
        error:
          "Missing env vars: SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    const { token_hash, type, new_password } = req.body || {};

    if (!token_hash || !type || !new_password) {
      return json(res, 400, { ok: false, error: "Missing fields" });
    }

    if (!isStrongEnough(new_password)) {
      return json(res, 400, {
        ok: false,
        error: "Weak password (min 8 chars, letters and numbers).",
      });
    }

    // Cliente ANON solo para verificar el OTP recovery (no admin)
    const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: otpData, error: otpError } = await supabaseAnon.auth.verifyOtp({
      token_hash,
      type,
    });

    if (otpError || !otpData?.user?.id) {
      return json(res, 401, {
        ok: false,
        error: otpError?.message || "Invalid or expired recovery link",
      });
    }

    const userId = otpData.user.id;

    // Cliente SERVICE ROLE para cambiar password sin sesión
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { error: updError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: new_password,
    });

    if (updError) {
      return json(res, 500, { ok: false, error: updError.message || "Update failed" });
    }

    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { ok: false, error: e?.message || "Unexpected error" });
  }
}
