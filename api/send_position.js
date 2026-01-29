// api/send_position.js
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

const VERSION = "send-position-api-v1-smart-table";
const TABLE_CANDIDATES = [
  "tracker_logs",
  "tracker_locations",
  "tracker_positions",
  "posiciones",
  "positions",
  "position_events",
];

function json(res, status, payload) {
  res.status(status).json({ version: VERSION, ...payload });
}

function getEnv(nameList) {
  for (const n of nameList) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const p of cookieHeader.split(";")) {
    const i = p.indexOf("=");
    if (i === -1) continue;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

function getBearer(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || "";
  const s = String(h || "").trim();
  const m = s.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || "";
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
  let j = {};
  try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text }; }

  if (!r.ok || !j?.access_token) {
    const msg = j?.error_description || j?.error || "Failed to refresh token";
    const err = new Error(msg);
    err.status = 401;
    throw err;
  }
  return j;
}

async function resolveUser({ supabaseUrl, anonKey, req, res }) {
  let accessToken = getBearer(req);

  // compat: cookies legacy (tg_at / tg_rt)
  const cookies = parseCookies(req.headers.cookie || "");
  const tg_at = cookies.tg_at || "";
  const tg_rt = cookies.tg_rt || "";

  if (!accessToken) accessToken = tg_at;

  if (!accessToken && tg_rt) {
    const r = await refreshAccessToken({ supabaseUrl, anonKey, refreshToken: tg_rt });
    accessToken = r.access_token;
    // no necesitamos set-cookie aquí; ya no dependemos de cookies
  }

  if (!accessToken) return { ok: false, status: 401, error: "No autenticado (Bearer o tg_at requerido)" };

  const sbUser = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data, error } = await sbUser.auth.getUser();
  if (error || !data?.user?.id) return { ok: false, status: 401, error: "Sesión inválida" };

  return { ok: true, user: data.user, accessToken };
}

async function getMyContext({ supabaseUrl, anonKey, accessToken }) {
  const sbUser = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  // tu AuthContext depende de get_my_context
  const { data, error } = await sbUser.rpc("get_my_context");
  if (error) throw new Error(`get_my_context failed: ${error.message}`);
  if (!data?.ok) throw new Error(`get_my_context not ok: ${data?.error || "unknown"}`);

  return data;
}

async function getTableColumns(sbAdmin, table) {
  const { data, error } = await sbAdmin
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", table);

  if (error) return [];
  return (data || []).map((r) => r.column_name);
}

function buildInsertRow(cols, payload) {
  const has = (c) => cols.includes(c);

  const lat = Number(payload.lat);
  const lng = Number(payload.lng);

  // Timestamp: si viene, úsalo; si no, now()
  const tsIso = payload.ts ? String(payload.ts) : null;

  const row = {};

  // org_id / tenant
  if (payload.org_id && has("org_id")) row.org_id = payload.org_id;
  if (payload.org_id && has("tenant_id")) row.tenant_id = payload.org_id;

  // user/tracker
  if (payload.user_id && has("user_id")) row.user_id = payload.user_id;
  if (payload.user_id && has("tracker_user_id")) row.tracker_user_id = payload.user_id;
  if (payload.user_id && has("tracker_id")) row.tracker_id = payload.user_id;

  // person_id opcional
  if (payload.person_id && has("person_id")) row.person_id = payload.person_id;

  // lat/lng variantes
  if (has("lat")) row.lat = lat;
  if (has("lng")) row.lng = lng;
  if (has("latitude")) row.latitude = lat;
  if (has("longitude")) row.longitude = lng;
  if (has("lon")) row.lon = lng;

  // extras
  if (payload.accuracy != null && has("accuracy")) row.accuracy = Number(payload.accuracy);
  if (payload.speed != null && has("speed")) row.speed = Number(payload.speed);
  if (payload.heading != null && has("heading")) row.heading = Number(payload.heading);
  if (payload.altitude != null && has("altitude")) row.altitude = Number(payload.altitude);

  // created_at / ts
  if (tsIso && has("created_at")) row.created_at = tsIso;
  if (tsIso && has("ts")) row.ts = tsIso;
  if (tsIso && has("timestamp")) row.timestamp = tsIso;

  // geom si existe (geography/geometry). PostGIS acepta WKT/GeoJSON según tipo; usamos WKT Point.
  if ((has("geom") || has("geog") || has("geometry")) && Number.isFinite(lat) && Number.isFinite(lng)) {
    const wkt = `POINT(${lng} ${lat})`;
    if (has("geom")) row.geom = wkt;
    else if (has("geog")) row.geog = wkt;
    else if (has("geometry")) row.geometry = wkt;
  }

  return row;
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

    const supabaseUrl = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
    const anonKey = getEnv(["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"]);
    const serviceKey = getEnv(["SUPABASE_SERVICE_ROLE_KEY"]);

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json(res, 500, { ok: false, error: "Missing Supabase env vars" });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return json(res, 400, { ok: false, error: "lat/lng inválidos" });
    }

    // Auth user (Bearer preferred)
    const u = await resolveUser({ supabaseUrl, anonKey, req, res });
    if (!u.ok) return json(res, u.status, { ok: false, error: u.error });

    const user = u.user;
    const accessToken = u.accessToken;

    // Context: org + role
    const ctx = await getMyContext({ supabaseUrl, anonKey, accessToken });
    const role = String(ctx?.role || "").toLowerCase();
    if (role !== "tracker") {
      return json(res, 403, { ok: false, error: `Rol inválido: ${role}` });
    }

    const org_id = String(body.org_id || ctx.org_id || "").trim();
    if (!org_id) return json(res, 400, { ok: false, error: "org_id requerido (body o ctx)" });

    const sbAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // Elegir tabla destino de forma inteligente
    let chosen = null;
    let chosenCols = [];

    for (const t of TABLE_CANDIDATES) {
      const cols = await getTableColumns(sbAdmin, t);
      if (!cols || cols.length === 0) continue;

      const hasLatLng =
        cols.includes("lat") && cols.includes("lng") ||
        cols.includes("latitude") && cols.includes("longitude");

      const hasTrackerId =
        cols.includes("tracker_user_id") || cols.includes("tracker_id") || cols.includes("user_id");

      if (hasLatLng && hasTrackerId) {
        chosen = t;
        chosenCols = cols;
        break;
      }
    }

    if (!chosen) {
      return json(res, 500, {
        ok: false,
        error: "No encontré tabla destino para posiciones (lat/lng + tracker_user_id/user_id).",
        details: { tried: TABLE_CANDIDATES },
      });
    }

    const row = buildInsertRow(chosenCols, {
      ...body,
      org_id,
      user_id: user.id,
      ts: body.ts || new Date().toISOString(),
    });

    // Insert
    const { error: insErr } = await sbAdmin.from(chosen).insert(row);
    if (insErr) {
      return json(res, 500, {
        ok: false,
        error: "Insert failed",
        details: insErr.message,
        table: chosen,
        row_keys: Object.keys(row),
      });
    }

    return json(res, 200, {
      ok: true,
      table: chosen,
      org_id,
      user_id: user.id,
      received: { lat, lng },
    });
  } catch (e) {
    console.error("[api/send_position] fatal:", e);
    return json(res, 500, { ok: false, error: "Unexpected error", details: e?.message || String(e) });
  }
}
