// api/auth/session.js
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const p of cookieHeader.split(";")) {
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
    domain,
  } = opts;

  let s = `${name}=${encodeURIComponent(value ?? "")}`;
  if (domain) s += `; Domain=${domain}`;
  if (path) s += `; Path=${path}`;
  if (typeof maxAge === "number") s += `; Max-Age=${maxAge}`;
  if (sameSite) s += `; SameSite=${sameSite}`;
  if (secure) s += `; Secure`;
  if (httpOnly) s += `; HttpOnly`;
  return s;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function safeJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return {};
}

function getBearer(req) {
  const h = String(req.headers?.authorization || req.headers?.Authorization || "").trim();
  if (!h) return "";
  const m = h.match(/^bearer\s+(.+)$/i);
  return m ? String(m[1]).trim() : "";
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

  const text = await r.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!r.ok || !json?.access_token) {
    const msg = json?.error_description || json?.error || "Failed to refresh token";
    const err = new Error(msg);
    err.status = 401;
    err.body = json || null;
    throw err;
  }

  return json;
}

// ✅ Usamos Admin API si tenemos service role: robusto, no requiere refresh cookie
async function getUserFromAccessTokenAdmin({ supabaseUrl, serviceKey, accessToken }) {
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.getUser(accessToken);
  if (error) return { user: null, error };
  return { user: data?.user || null, error: null };
}

// Fallback (si no hay service role): el método anterior con anonKey
async function getUserFromAccessTokenAnon({ url, anonKey, accessToken }) {
  const sbUser = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data } = await sbUser.auth.getUser();
  return { sbUser, user: data?.user || null };
}

async function computeIsAppRoot({ userEmail, roleFromBoot, serviceClient }) {
  const role = String(roleFromBoot || "").toLowerCase();
  if (role === "root" || role === "root_owner") return true;

  const email = normalizeEmail(userEmail);

  const envRaw = process.env.APP_ROOT_EMAILS || "";
  const envList = envRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (envList.includes(email)) return true;

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

async function acceptTrackerInvite({ serviceClient, invite_id, user }) {
  const inviteId = String(invite_id || "").trim();
  if (!inviteId) {
    const e = new Error("invite_id requerido");
    e.status = 400;
    throw e;
  }

  const userEmail = normalizeEmail(user?.email);
  if (!userEmail) {
    const e = new Error("user email no disponible");
    e.status = 400;
    throw e;
  }

  const { data: inv, error: invErr } = await serviceClient
    .from("tracker_invites")
    .select("id, org_id, email_norm, expires_at, used_at")
    .eq("id", inviteId)
    .maybeSingle();

  if (invErr) {
    const e = new Error(invErr.message || "Error leyendo tracker_invites");
    e.status = 500;
    throw e;
  }

  if (!inv) {
    const e = new Error("Invitación no encontrada");
    e.status = 404;
    throw e;
  }

  if (inv.used_at) {
    const e = new Error("Invitación ya fue usada");
    e.status = 409;
    throw e;
  }

  const exp = inv.expires_at ? new Date(inv.expires_at).getTime() : 0;
  if (exp && Date.now() > exp) {
    const e = new Error("Invitación expirada");
    e.status = 410;
    throw e;
  }

  if (normalizeEmail(inv.email_norm) !== userEmail) {
    const e = new Error("Email no coincide con invitación");
    e.status = 403;
    throw e;
  }

  const orgId = inv.org_id;

  // Regla: admin NO puede ser tracker
  const { data: existing, error: exErr } = await serviceClient
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (exErr) {
    const e = new Error(exErr.message || "Error leyendo memberships");
    e.status = 500;
    throw e;
  }

  if (existing?.role && existing.role !== "tracker") {
    const e = new Error(`Este usuario ya tiene rol '${existing.role}' en esta organización. No puede ser tracker.`);
    e.status = 409;
    throw e;
  }

  const { error: upErr } = await serviceClient
    .from("memberships")
    .upsert({ org_id: orgId, user_id: user.id, role: "tracker", is_default: false }, { onConflict: "org_id,user_id" });

  if (upErr) {
    const e = new Error(upErr.message || "Error creando rol tracker");
    e.status = 500;
    throw e;
  }

  const { error: useErr } = await serviceClient
    .from("tracker_invites")
    .update({ used_at: new Date().toISOString(), used_by_user_id: user.id })
    .eq("id", inviteId);

  if (useErr) {
    const e = new Error(useErr.message || "Error marcando invitación usada");
    e.status = 500;
    throw e;
  }

  return { org_id: orgId, role: "tracker" };
}

// ---------- memberships helpers (UNIVERSAL) ----------

async function listMembershipsForUser({ sbUser, serviceClient, userId }) {
  const base = serviceClient || sbUser;

  let r = await base
    .from("memberships")
    .select("org_id, role, is_default, created_at")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (r?.error && String(r.error.message || "").toLowerCase().includes("is_default")) {
    r = await base
      .from("memberships")
      .select("org_id, role, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
  }

  if (r.error) return { rows: [], error: r.error };

  const rows = Array.isArray(r.data) ? r.data : [];
  return { rows, error: null };
}

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function pickOrgFromMemberships(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const def = rows.find((x) => x?.is_default === true && x?.org_id);
  if (def?.org_id) return def.org_id;

  const preferred = rows.find((x) => {
    const r = normalizeRole(x?.role);
    return (r === "owner" || r === "admin") && x?.org_id;
  });
  if (preferred?.org_id) return preferred.org_id;

  const first = rows.find((x) => x?.org_id);
  return first?.org_id || null;
}

async function ensureDefaultMembership({ serviceClient, userId, rows }) {
  if (!serviceClient) return { changed: false, org_id: null };

  const hasDefault = rows.some((r) => r?.is_default === true);
  if (hasDefault) {
    const def = rows.find((r) => r?.is_default === true);
    return { changed: false, org_id: def?.org_id || null };
  }

  const candidate =
    rows.find((r) => {
      const rr = normalizeRole(r?.role);
      return (rr === "owner" || rr === "admin") && r?.org_id;
    }) || rows.find((r) => r?.org_id) || null;

  if (!candidate?.org_id) return { changed: false, org_id: null };

  await serviceClient
    .from("memberships")
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("is_default", true);

  const { error: upErr } = await serviceClient
    .from("memberships")
    .update({ is_default: true })
    .eq("user_id", userId)
    .eq("org_id", candidate.org_id);

  if (upErr) {
    return { changed: false, org_id: candidate.org_id };
  }

  return { changed: true, org_id: candidate.org_id };
}

export default async function handler(req, res) {
  const build_tag = "auth-session-v23-bearer-first";
  const debug = process.env.AUTH_DEBUG === "1";

  try {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey) {
      return res.status(500).json({
        build_tag,
        ok: false,
        error: "Missing SUPABASE_URL / SUPABASE_ANON_KEY",
      });
    }

    const cookieDomain = process.env.COOKIE_DOMAIN || "";
    const cookies = parseCookies(req.headers.cookie || "");

    // ✅ 1) Preferir Bearer token (frontend sb-*-auth-token)
    const bearer = getBearer(req);

    // ✅ 2) Fallback cookies (legacy)
    let access_token = bearer || cookies.tg_at || "";
    const refresh_token = cookies.tg_rt || "";
    const forced_org = cookies.tg_org || "";

    const body = req.method === "POST" ? safeJsonBody(req) : {};
    if (req.method === "POST" && body === null) {
      return res.status(400).json({ build_tag, ok: false, error: "Invalid JSON body" });
    }

    const bodyAccess = String(body?.access_token || "").trim();
    const bodyRefresh = String(body?.refresh_token || "").trim();

    const setCookieParts = [];

    // Si el cliente envía access_token explícito en body, lo aceptamos
    if (bodyAccess) {
      access_token = bodyAccess;
      setCookieParts.push(
        makeCookie("tg_at", access_token, {
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          path: "/",
          domain: cookieDomain || undefined,
          maxAge: 3600,
        })
      );
    }

    if (bodyRefresh) {
      setCookieParts.push(
        makeCookie("tg_rt", bodyRefresh, {
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          path: "/",
          domain: cookieDomain || undefined,
          maxAge: 30 * 24 * 60 * 60,
        })
      );
    }

    // ✅ Solo intentamos refresh si NO hay bearer/access y sí hay refresh cookie
    if (!access_token && refresh_token) {
      const r = await refreshAccessToken({ supabaseUrl: url, anonKey, refreshToken: refresh_token });
      access_token = r.access_token;

      const accessMaxAge = Number(r.expires_in || 3600);
      const refreshMaxAge = 30 * 24 * 60 * 60;

      setCookieParts.push(
        makeCookie("tg_at", r.access_token, {
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          path: "/",
          domain: cookieDomain || undefined,
          maxAge: accessMaxAge,
        }),
        makeCookie("tg_rt", r.refresh_token || refresh_token, {
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          path: "/",
          domain: cookieDomain || undefined,
          maxAge: refreshMaxAge,
        })
      );
    }

    if (setCookieParts.length) {
      res.setHeader("Set-Cookie", setCookieParts);
    }

    if (!access_token) {
      return res.status(200).json({ build_tag, ok: true, authenticated: false });
    }

    // ✅ Resolver user (prefer admin getUser si hay serviceKey)
    let user = null;
    let sbUser = null;

    if (serviceKey) {
      const r = await getUserFromAccessTokenAdmin({ supabaseUrl: url, serviceKey, accessToken: access_token });
      user = r.user || null;
      // Para RPCs (bootstrap_session_context) seguimos usando un cliente anon con header Authorization
      sbUser = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${access_token}` } },
      });
    } else {
      const r = await getUserFromAccessTokenAnon({ url, anonKey, accessToken: access_token });
      sbUser = r.sbUser;
      user = r.user;
    }

    // Si aún no hay user y hay refresh cookie, intentamos refresh (legacy)
    if (!user && refresh_token) {
      const refreshed = await refreshAccessToken({ supabaseUrl: url, anonKey, refreshToken: refresh_token });
      access_token = refreshed.access_token;

      const accessMaxAge = Number(refreshed.expires_in || 3600);
      const refreshMaxAge = 30 * 24 * 60 * 60;

      res.setHeader("Set-Cookie", [
        makeCookie("tg_at", refreshed.access_token, {
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          path: "/",
          domain: cookieDomain || undefined,
          maxAge: accessMaxAge,
        }),
        makeCookie("tg_rt", refreshed.refresh_token || refresh_token, {
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          path: "/",
          domain: cookieDomain || undefined,
          maxAge: refreshMaxAge,
        }),
      ]);

      if (serviceKey) {
        const r2 = await getUserFromAccessTokenAdmin({ supabaseUrl: url, serviceKey, accessToken: access_token });
        user = r2.user || null;
        sbUser = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${access_token}` } },
        });
      } else {
        const r2 = await getUserFromAccessTokenAnon({ url, anonKey, accessToken: access_token });
        sbUser = r2.sbUser;
        user = r2.user;
      }
    }

    if (!user) {
      return res.status(200).json({ build_tag, ok: true, authenticated: false });
    }

    const serviceClient = serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;

    // POST actions
    if (req.method === "POST") {
      const action = String(body?.action || "").trim();

      if (action === "accept_tracker_invite") {
        if (!serviceClient) {
          return res.status(500).json({ build_tag, ok: false, error: "Missing service role key" });
        }

        const result = await acceptTrackerInvite({
          serviceClient,
          invite_id: body?.invite_id,
          user,
        });

        res.setHeader("Set-Cookie", [
          makeCookie("tg_org", String(result.org_id), {
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
            path: "/",
            domain: cookieDomain || undefined,
            maxAge: 30 * 24 * 60 * 60,
          }),
        ]);

        return res.status(200).json({
          build_tag,
          ok: true,
          accepted: true,
          org_id: result.org_id,
          role: "tracker",
        });
      }

      return res.status(200).json({ build_tag, ok: true, authenticated: true });
    }

    // GET session (legacy)
    let current_org_id = null;
    let role = null;

    if (forced_org) {
      current_org_id = forced_org;

      if (serviceClient) {
        const { data: rRow, error: rErr } = await serviceClient
          .from("memberships")
          .select("role")
          .eq("user_id", user.id)
          .eq("org_id", current_org_id)
          .maybeSingle();

        if (!rErr) role = rRow?.role || null;
      }
    }

    if (!current_org_id) {
      try {
        const { data: boot } = await sbUser.rpc("bootstrap_session_context");
        current_org_id = boot?.[0]?.org_id || null;
        role = role ?? (boot?.[0]?.role || null);
      } catch {
        // ok: tracker flow no requiere esto estrictamente
      }
    }

    const { rows: membershipRows, error: memErr } = await listMembershipsForUser({
      sbUser,
      serviceClient,
      userId: user.id,
    });

    let defaultFix = { changed: false, org_id: null };
    if (!memErr && membershipRows.length > 0) {
      defaultFix = await ensureDefaultMembership({ serviceClient, userId: user.id, rows: membershipRows });
    }

    if (!forced_org) {
      const picked = pickOrgFromMemberships(membershipRows);
      current_org_id = defaultFix.org_id || current_org_id || picked || null;

      if (!role && current_org_id) {
        const hit = membershipRows.find((m) => m?.org_id === current_org_id);
        role = hit?.role || role;
      }
    }

    if (current_org_id && !forced_org) {
      res.setHeader("Set-Cookie", [
        makeCookie("tg_org", String(current_org_id), {
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          path: "/",
          domain: cookieDomain || undefined,
          maxAge: 30 * 24 * 60 * 60,
        }),
      ]);
    }

    const is_app_root = await computeIsAppRoot({
      userEmail: user.email,
      roleFromBoot: role,
      serviceClient,
    });

    const organizations =
      membershipRows.length > 0
        ? membershipRows.map((m) => (m?.org_id ? { id: m.org_id } : null)).filter(Boolean)
        : current_org_id
        ? [{ id: current_org_id }]
        : [];

    return res.status(200).json({
      build_tag,
      ok: true,
      authenticated: true,
      bootstrapped: true,
      user: { id: user.id, email: user.email },
      current_org_id,
      role,
      is_app_root,
      organizations,
      ...(debug
        ? {
            debug: {
              auth_mode: bearer ? "bearer" : "cookie",
              forced_org: forced_org || null,
              memberships: {
                total: membershipRows.length,
                fixed_default: defaultFix.changed,
                fixed_to: defaultFix.org_id || null,
              },
            },
          }
        : {}),
    });
  } catch (e) {
    console.error("[api/auth/session] fatal:", e);
    return res.status(500).json({
      build_tag: "auth-session-v23-bearer-first",
      ok: false,
      error: String(e?.message || e),
      ...(process.env.AUTH_DEBUG === "1"
        ? { debug: { body: e?.body || null, status: e?.status || null } }
        : {}),
    });
  }
}
