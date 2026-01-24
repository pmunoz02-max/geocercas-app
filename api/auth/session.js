import { createClient } from "@supabase/supabase-js";

/** Minimal cookie parser (no deps) */
function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  const parts = cookieHeader.split(";");
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i === -1) continue;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function makeCookie(name, value, opts = {}) {
  const {
    httpOnly = true,
    secure = true,
    sameSite = "Lax",
    path = "/",
    maxAge,
  } = opts;

  let s = `${name}=${encodeURIComponent(value ?? "")}`;
  if (path) s += `; Path=${path}`;
  if (typeof maxAge === "number") s += `; Max-Age=${maxAge}`;
  if (sameSite) s += `; SameSite=${sameSite}`;
  if (secure) s += `; Secure`;
  if (httpOnly) s += `; HttpOnly`;
  return s;
}

async function refreshAccessToken({ supabaseUrl, anonKey, refreshToken }) {
  const url = `${String(supabaseUrl).replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const json = await r.json().catch(() => ({}));

  if (!r.ok || !json?.access_token) {
    const err = new Error(json?.error_description || "Failed to refresh token");
    err.status = 401;
    throw err;
  }

  return json;
}

async function getUserFromAccessToken({ url, anonKey, accessToken }) {
  const sbUser = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data } = await sbUser.auth.getUser();
  return { sbUser, user: data?.user || null };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function computeIsAppRoot({
  userEmail,
  roleFromBoot,
  serviceClient,
}) {
  const role = String(roleFromBoot || "").toLowerCase();
  if (role === "root" || role === "root_owner") return true;

  const email = normalizeEmail(userEmail);

  // 1️⃣ ENV canónico
  const envRaw = process.env.APP_ROOT_EMAILS || "";
  const envList = envRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (envList.includes(email)) return true;

  // 2️⃣ Fallback DB opcional (blindaje)
  if (serviceClient) {
    const { data } = await serviceClient
      .from("app_root_users")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (data) return true;
  }

  return false;
}

export default async function handler(req, res) {
  const build_tag = "session-v14-root-blinded";

  try {
    if (req.method !== "GET" && req.method !== "OPTIONS") {
      res.setHeader("Allow", "GET,OPTIONS");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey) {
      return res.status(500).json({ authenticated: false });
    }

    const cookies = parseCookies(req.headers.cookie || "");
    let access_token = cookies.tg_at;
    const refresh_token = cookies.tg_rt;

    if (!access_token && refresh_token) {
      const r = await refreshAccessToken({ supabaseUrl: url, anonKey, refreshToken: refresh_token });
      access_token = r.access_token;
    }

    if (!access_token) {
      return res.status(200).json({ authenticated: false });
    }

    const { sbUser, user } = await getUserFromAccessToken({
      url,
      anonKey,
      accessToken: access_token,
    });

    if (!user) {
      return res.status(200).json({ authenticated: false });
    }

    const { data: boot } = await sbUser.rpc("bootstrap_session_context");

    const current_org_id = boot?.[0]?.org_id || null;
    const role = boot?.[0]?.role || null;

    const serviceClient = serviceKey
      ? createClient(url, serviceKey, { auth: { persistSession: false } })
      : null;

    const is_app_root = await computeIsAppRoot({
      userEmail: user.email,
      roleFromBoot: role,
      serviceClient,
    });

    return res.status(200).json({
      build_tag,
      authenticated: true,
      bootstrapped: true,
      user: { id: user.id, email: user.email },
      current_org_id,
      role,
      is_app_root,
      organizations: current_org_id ? [{ id: current_org_id }] : [],
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ authenticated: false, error: e.message });
  }
}
