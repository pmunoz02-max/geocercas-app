// api/geofences.js
import { createClient } from "@supabase/supabase-js";

const VERSION = "geofences-api-v3-orgid-geojson-notnull";

/* =========================
   Cookies + Headers
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
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");

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

function getQuery(req) {
  try {
    const url = new URL(req.url, "http://localhost");
    const q = {};
    url.searchParams.forEach((v, k) => (q[k] = v));
    return q;
  } catch {
    return {};
  }
}

function normalizeBoolFlag(v, defaultValue) {
  if (v === undefined || v === null || v === "") return defaultValue;
  const s = String(v).toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return defaultValue;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
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

async function insertMetricsEventSilent(sbDb, { org_id, user_id, event_type, meta = {} }) {
  try {
    await sbDb.from("org_metrics_events").insert({
      org_id,
      user_id,
      event_type,
      meta,
    });
  } catch (_) {
    // ignore metrics errors
  }
}

/* =========================
   Sanitizers + Whitelist
========================= */

function stripServerOwned(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const out = { ...p };

  // 🔒 NO permitir que se cuele en row
  delete out.action;

  // server-owned / generated / audit (no enviar desde cliente)
  delete out.bbox;
  delete out.geom;
  delete out.created_at;
  delete out.updated_at;
  delete out.deleted_at;
  delete out.revoked_at;
  delete out.created_by;
  delete out.updated_by;

  // multi-tenant / ownership (siempre desde ctx)
  delete out.org_id;
  delete out.tenant_id; // ⛔ NO existe en tabla (legacy)
  delete out.user_id;
  delete out.owner_id;
  delete out.usuario_id;

  // compat: NO permitir orgId enviado
  delete out.orgId;

  return out;
}

// Solo permitir columnas reales (evita 500 por schema cache)
const ALLOWED_FIELDS = new Set([
  "id",
  "name",
  "description",
  "polygon_geojson",
  "geojson",
  "lat",
  "lng",
  "radius_m",
  "active",
  "is_default",
  "source_geocerca_id",
]);

function pickAllowed(item) {
  const src = item && typeof item === "object" ? item : {};
  const out = {};
  for (const k of Object.keys(src)) {
    if (ALLOWED_FIELDS.has(k)) out[k] = src[k];
  }
  return out;
}

function ensureFeatureCollection(input) {
  if (!input) return null;
  if (input.type === "FeatureCollection" && Array.isArray(input.features)) return input;
  if (input.type === "Feature") return { type: "FeatureCollection", features: [input] };
  // si viene geometry suelta
  if (input.type && typeof input.type === "string" && input.coordinates) {
    return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: input }] };
  }
  return null;
}

function buildPointFC(lat, lng) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [lo, la] },
      },
    ],
  };
}

/* =========================
   Context Resolver (CANÓNICO)
========================= */

async function resolveContext(req, { requestedOrgId = null } = {}) {
  const SUPABASE_URL = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
  const SUPABASE_ANON_KEY = getEnv([
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]);

  const SUPABASE_SERVICE_ROLE_KEY = getEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"]);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      ok: false,
      status: 500,
      error: "Server misconfigured",
      details: {
        has: {
          SUPABASE_URL: Boolean(SUPABASE_URL),
          SUPABASE_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
          SUPABASE_SERVICE_ROLE_KEY: Boolean(SUPABASE_SERVICE_ROLE_KEY),
        },
      },
    };
  }

  const accessToken = getCookie(req, "tg_at");
  if (!accessToken) {
    return { ok: false, status: 401, error: "Not authenticated", details: "Missing tg_at cookie" };
  }

  const sbUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: u1, error: uerr } = await sbUser.auth.getUser();
  const user = u1?.user ? { id: u1.user.id, email: u1.user.email } : null;
  if (!user || uerr) {
    return { ok: false, status: 401, error: "Invalid session", details: uerr?.message || "No user" };
  }

  const sbSrv = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null;

  async function tryMaybeSingle(client, builderFn) {
    try {
      const { data, error } = await builderFn(client);
      if (error) return { ok: false, error };
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: { message: String(e?.message || e) } };
    }
  }

  let currentOrgId = null;
  const ucoQuery = (c) => c.from("user_current_org").select("org_id").eq("user_id", user.id).maybeSingle();
  if (requestedOrgId) {
    // Regla: si se pidió org explícita y no hay membership válida, 403 sin fallback
    const membershipForOrg = (orgId) => (c) =>
      c
        .from("memberships")
        .select("org_id, role, is_default, revoked_at")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .is("revoked_at", null)
        .maybeSingle();
    let m = null;
    if (sbSrv) {
      const r = await tryMaybeSingle(sbSrv, membershipForOrg(requestedOrgId));
      if (r.ok && r.data?.org_id) m = r.data;
    }
    if (!m) {
      const r2 = await tryMaybeSingle(sbUser, membershipForOrg(requestedOrgId));
      if (r2.ok && r2.data?.org_id) m = r2.data;
    }
    if (!m) {
      return {
        ok: false,
        status: 403,
        error: "Requested org is not available for current user",
        details: "No valid membership for requestedOrgId; fallback is forbidden by security policy."
      };
    }
    currentOrgId = String(requestedOrgId);
  } else {
    if (sbSrv) {
      const r1 = await tryMaybeSingle(sbSrv, ucoQuery);
      if (r1.ok && r1.data?.org_id) currentOrgId = String(r1.data.org_id);
    }
    if (!currentOrgId) {
      const r2 = await tryMaybeSingle(sbUser, ucoQuery);
      if (r2.ok && r2.data?.org_id) currentOrgId = String(r2.data.org_id);
    }
  }

  const membershipForOrg = (orgId) => (c) =>
    c
      .from("memberships")
      .select("org_id, role, is_default, revoked_at")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .is("revoked_at", null)
      .maybeSingle();

  const membershipDefault = (c) =>
    c
      .from("memberships")
      .select("org_id, role, is_default, revoked_at")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

  async function resolveMembership() {
    if (currentOrgId) {
      if (sbSrv) {
        const r = await tryMaybeSingle(sbSrv, membershipForOrg(currentOrgId));
        if (r.ok && r.data?.org_id) return r.data;
      }
      const r2 = await tryMaybeSingle(sbUser, membershipForOrg(currentOrgId));
      if (r2.ok && r2.data?.org_id) return r2.data;
    }

    if (sbSrv) {
      const r = await tryMaybeSingle(sbSrv, membershipDefault);
      if (r.ok && r.data?.org_id) return r.data;
    }
    const r2 = await tryMaybeSingle(sbUser, membershipDefault);
    if (r2.ok && r2.data?.org_id) return r2.data;

    return null;
  }

  const mRow = await resolveMembership();
  if (!mRow?.org_id) {
    return { ok: false, status: 403, error: "No membership", details: "User has no active membership" };
  }

  const ctx = {
    org_id: String(mRow.org_id),
    role: String(mRow.role || "member"),
  };

  const sbDb = sbSrv || sbUser;

  return { ok: true, ctx, user, sbDb };
}

/* =========================
   Handler
========================= */

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      setHeaders(res);
      res.statusCode = 204;
      return res.end();
    }
    if (req.method === "HEAD") {
      setHeaders(res);
      res.statusCode = 200;
      return res.end();
    }

    const q = getQuery(req);
    const requestedOrgId = q.org_id || q.orgId || null;
    const ctxRes = await resolveContext(req, { requestedOrgId });
    if (!ctxRes.ok) return send(res, ctxRes.status, { ok: false, error: ctxRes.error, details: ctxRes.details });

    const { ctx, sbDb, user } = ctxRes;
    const org_id = String(ctx.org_id);
    const user_id = String(user.id);

    // GET
    if (req.method === "GET") {
      const action = String(q.action || "list");

      if (action === "list") {
        const onlyActive = normalizeBoolFlag(q.onlyActive, true);
        const limit = Math.min(Number(q.limit || 2000), 2000);

        const { data, error } = await sbDb.from("geofences").select("*").eq("org_id", org_id).limit(limit);

        if (error) return ok(res, { ok: false, items: [], error: "Supabase error", details: error.message });

        const items = Array.isArray(data) ? data : [];
        if (!onlyActive) return ok(res, { ok: true, items });

        const filtered = items.filter((row) => {
          const j = row || {};
          const deletedAt = j.deleted_at ?? null;
          if (deletedAt) return false;
          const a = j.is_active ?? j.active;
          if (typeof a === "boolean") return a === true;
          return true;
        });

        return ok(res, { ok: true, items: filtered });
      }

      if (action === "get") {
        const id = q.id ? String(q.id) : null;
        if (!id) return send(res, 400, { ok: false, error: "id is required" });

        const { data, error } = await sbDb
          .from("geofences")
          .select("*")
          .eq("org_id", org_id)
          .eq("id", id)
          .maybeSingle();

        if (error) return send(res, 500, { ok: false, error: "Supabase error", details: error.message });
        return ok(res, { ok: true, item: data || null });
      }

      return send(res, 400, { ok: false, error: "Unsupported action", action });
    }

    // POST
    if (req.method === "POST") {
      const rawPayload = await readBody(req);
      const payload = stripServerOwned(rawPayload);
      const action = String(rawPayload?.action || payload?.action || "upsert").toLowerCase();

      if (!requireWriteRole(ctx.role)) {
        return send(res, 403, { ok: false, error: "Forbidden", details: "Requires owner/admin role" });
      }

      if (action === "upsert") {
        const item0 = payload?.item && typeof payload.item === "object" ? payload.item : payload;

        // 🔒 blindaje extra: por si "action" venía dentro de item
        const tmp = { ...item0 };
        delete tmp.action;
        delete tmp.tenant_id;

        const picked = pickAllowed(tmp);

        // Normalizar geojson/polygon_geojson (geojson es NOT NULL)
        const fcPolygon = ensureFeatureCollection(picked.polygon_geojson);
        const fcGeo = ensureFeatureCollection(picked.geojson);

        let geojson = fcGeo || fcPolygon || null;
        let polygon_geojson = fcPolygon || fcGeo || null;

        if (!geojson) {
          // fallback punto si vienen lat/lng
          const pointFc = buildPointFC(picked.lat, picked.lng);
          if (pointFc) {
            geojson = pointFc;
            polygon_geojson = pointFc;
          }
        }

        if (!geojson) {
          return send(res, 400, {
            ok: false,
            error: "geojson is required",
            details: "Table geofences.geojson is NOT NULL. Provide geojson or polygon_geojson (FeatureCollection).",
          });
        }

        const name = picked?.name ?? tmp?.nombre ?? null;

        // radius_m puede ser NOT NULL en algunas instalaciones
        let radius_m = picked.radius_m;
        if (radius_m === undefined || radius_m === null || radius_m === "") radius_m = 0;
        radius_m = Number.isFinite(Number(radius_m)) ? Number(radius_m) : 0;

        // Construir row SOLO con columnas reales
        const row = {
          ...(picked.id ? { id: picked.id } : {}),
          name: name ? String(name).trim() : undefined,
          description: picked.description ?? undefined,
          polygon_geojson,
          geojson,
          lat: picked.lat ?? undefined,
          lng: picked.lng ?? undefined,
          radius_m: Math.trunc(radius_m),
          active: typeof picked.active === "boolean" ? picked.active : undefined,
          is_default: typeof picked.is_default === "boolean" ? picked.is_default : undefined,
          source_geocerca_id: picked.source_geocerca_id ?? undefined,

          org_id,
          user_id,
          updated_at: new Date().toISOString(),
          updated_by: user_id,
        };

        // Si es insert nuevo y active no vino, lo ponemos en true para evitar NULL (si aplica)
        const isUpdate = Boolean(row.id);
        if (!isUpdate && row.active === undefined) row.active = true;

        // created_by solo al insertar
        if (!isUpdate) row.created_by = user_id;

        // Limpiar undefined para PostgREST
        for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];

        if (row.id) {
          const id = String(row.id);
          delete row.id;

          const { data, error } = await sbDb
            .from("geofences")
            .update(row)
            .eq("org_id", org_id)
            .eq("id", id)
            .select("*");

          if (error) return send(res, 500, { ok: false, error: "Supabase error", details: error.message });
          const arr = Array.isArray(data) ? data : data ? [data] : [];
          return ok(res, { ok: true, saved: arr.length, items: arr, item: arr[0] || null });
        }

        const { data, error } = await sbDb.from("geofences").insert(row).select("*");
        if (error) return send(res, 500, { ok: false, error: "Supabase error", details: error.message });

        const arr = Array.isArray(data) ? data : data ? [data] : [];

        await insertMetricsEventSilent(sbDb, {
          org_id,
          user_id,
          event_type: "geofence_created",
          meta: {
            geofence_id: arr[0]?.id || null,
          },
        });

        return ok(res, { ok: true, saved: arr.length, items: arr, item: arr[0] || null });
      }

      if (action === "delete") {
        const id = payload?.id ? String(payload.id) : null;
        if (!id) return send(res, 400, { ok: false, error: "id is required" });

        const { data, error } = await sbDb.from("geofences").delete().eq("org_id", org_id).eq("id", id).select("*");

        if (error) return send(res, 500, { ok: false, error: "Supabase error", details: error.message });

        const arr = Array.isArray(data) ? data : data ? [data] : [];
        return ok(res, { ok: true, deleted: arr.length, items: arr });
      }

      return send(res, 400, { ok: false, error: "Unsupported action", action });
    }

    res.setHeader("Allow", "GET,POST,OPTIONS,HEAD");
    return send(res, 405, { ok: false, error: "Method not allowed" });
  } catch (e) {
    return send(res, 500, { ok: false, error: "Server error", details: String(e?.message || e) });
  }
}
