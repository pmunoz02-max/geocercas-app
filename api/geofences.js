// api/geofences.js
import { createClient } from "@supabase/supabase-js";

const VERSION = "geofences-api-v2-org-only";

/* =========================
   Helpers
========================= */

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map((s) => s.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

function setHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store, no-cache, max-age=0, must-revalidate");
  res.setHeader("Vary", "Cookie");
  res.setHeader("X-Api-Version", VERSION);
}

function send(res, status, body) {
  setHeaders(res);
  res.statusCode = status;
  res.end(JSON.stringify({ ...body, version: VERSION }));
}

function ok(res, body) {
  return send(res, 200, body);
}

function getEnv(nameList) {
  for (const n of nameList) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

function requireWriteRole(role) {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin";
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");

  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/* =========================
   Strip server-owned
========================= */

function stripServerOwned(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const out = { ...p };

  delete out.action;

  delete out.org_id;
  delete out.tenant_id;
  delete out.user_id;
  delete out.created_at;
  delete out.updated_at;
  delete out.created_by;
  delete out.updated_by;
  delete out.geom;
  delete out.bbox;

  return out;
}

/* =========================
   Context
========================= */

async function resolveContext(req) {
  const SUPABASE_URL = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
  const SUPABASE_ANON_KEY = getEnv(["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"]);
  const SUPABASE_SERVICE_ROLE_KEY = getEnv(["SUPABASE_SERVICE_ROLE_KEY"]);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, status: 500, error: "Server misconfigured" };
  }

  const accessToken = getCookie(req, "tg_at");
  if (!accessToken) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }

  const sbUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });

  const { data: u1, error: uerr } = await sbUser.auth.getUser();
  if (uerr || !u1?.user) {
    return { ok: false, status: 401, error: "Invalid session" };
  }

  const user = u1.user;

  const sbSrv = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : sbUser;

  const { data: membership } = await sbSrv
    .from("memberships")
    .select("org_id, role")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!membership?.org_id) {
    return { ok: false, status: 403, error: "No membership" };
  }

  return {
    ok: true,
    ctx: {
      org_id: String(membership.org_id),
      role: String(membership.role || "member"),
    },
    user,
    sbDb: sbSrv,
  };
}

/* =========================
   Handler
========================= */

export default async function handler(req, res) {
  try {
    const ctxRes = await resolveContext(req);
    if (!ctxRes.ok)
      return send(res, ctxRes.status, { ok: false, error: ctxRes.error });

    const { ctx, sbDb, user } = ctxRes;
    const org_id = ctx.org_id;
    const user_id = user.id;

    /* =========================
       GET
    ========================= */

    if (req.method === "GET") {
      const { data, error } = await sbDb
        .from("geofences")
        .select("*")
        .eq("org_id", org_id);

      if (error)
        return send(res, 500, { ok: false, error: error.message });

      return ok(res, { ok: true, items: data || [] });
    }

    /* =========================
       POST (upsert)
    ========================= */

    if (req.method === "POST") {
      const raw = await readBody(req);
      const payload = stripServerOwned(raw);

      if (!requireWriteRole(ctx.role)) {
        return send(res, 403, { ok: false, error: "Forbidden" });
      }

      const item = payload.item || payload;

      const row = {
        ...item,
        org_id,
        user_id,
        updated_at: new Date().toISOString(),
        updated_by: user_id,
      };

      if (row.id) {
        const id = row.id;
        delete row.id;

        const { data, error } = await sbDb
          .from("geofences")
          .update(row)
          .eq("org_id", org_id)
          .eq("id", id)
          .select("*");

        if (error)
          return send(res, 500, { ok: false, error: error.message });

        return ok(res, { ok: true, item: data?.[0] || null });
      }

      const { data, error } = await sbDb
        .from("geofences")
        .insert(row)
        .select("*");

      if (error)
        return send(res, 500, { ok: false, error: error.message });

      return ok(res, { ok: true, item: data?.[0] || null });
    }

    return send(res, 405, { ok: false, error: "Method not allowed" });
  } catch (e) {
    return send(res, 500, { ok: false, error: String(e.message || e) });
  }
}