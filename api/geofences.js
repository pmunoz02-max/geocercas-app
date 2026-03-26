import { createClient } from "@supabase/supabase-js";

/**
 * api/geofences.js
 * Preview only
 * - un solo handler estable
 * - POST lee body una sola vez
 * - org_id controlado por backend
 * - compatibilidad legacy org_id / tenant_id
 * - delete con soft-delete si hay referencias
 * - sin .or() en Supabase
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

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

const SERVER_OWNED_FIELDS = new Set([
  "org_id",
  "orgId",
  "tenant_id",
  "tenantId",
  "user_id",
  "userId",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "deleted_at",
  "deleted_by",
]);

function setHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,HEAD,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-org-id"
  );
}

function send(res, status, payload) {
  setHeaders(res);
  res.statusCode = status;
  return res.end(JSON.stringify(payload));
}

function ok(res, payload) {
  return send(res, 200, payload);
}

function getQuery(req) {
  try {
    const url = new URL(req.url, "http://localhost");
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}

function getCookie(req, name) {
  const raw = req?.headers?.cookie || "";
  const parts = raw.split(";").map((s) => s.trim());

  for (const p of parts) {
    const i = p.indexOf("=");
    if (i <= 0) continue;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (k === name) return decodeURIComponent(v);
  }

  return null;
}

function getBearerToken(req) {
  const auth = req?.headers?.authorization || req?.headers?.Authorization || "";
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  const cookieCandidates = [
    "sb-access-token",
    "sb:token",
    "access_token",
    "supabase-auth-token",
  ];

  for (const name of cookieCandidates) {
    const value = getCookie(req, name);
    if (!value) continue;

    if (value.startsWith("base64-")) {
      try {
        const decoded = Buffer.from(value.slice(7), "base64").toString("utf8");
        const parsed = JSON.parse(decoded);
        if (parsed?.access_token) return String(parsed.access_token);
      } catch {
        // ignore
      }
    }

    try {
      const parsed = JSON.parse(value);
      if (parsed?.access_token) return String(parsed.access_token);
    } catch {
      // ignore plain string cookies
    }

    if (value.split(".").length === 3) return value;
  }

  return null;
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
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) return {};

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function stripServerOwned(item) {
  const src = item && typeof item === "object" ? item : {};
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (!SERVER_OWNED_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

function pickAllowed(item) {
  const src = item && typeof item === "object" ? item : {};
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (ALLOWED_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

function asNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildPointFC(lat, lng) {
  const latNum = asNumber(lat);
  const lngNum = asNumber(lng);
  if (latNum === null || lngNum === null) return null;

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Point",
          coordinates: [lngNum, latNum],
        },
      },
    ],
  };
}

function normalizeGeometryObject(obj) {
  if (!obj || typeof obj !== "object") return null;

  if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
    return obj;
  }

  if (obj.type === "Feature" && obj.geometry) {
    return {
      type: "FeatureCollection",
      features: [obj],
    };
  }

  if (obj.type && obj.coordinates) {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: obj,
        },
      ],
    };
  }

  return null;
}

function ensureFeatureCollection(value) {
  if (!value) return null;

  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }

  return normalizeGeometryObject(parsed);
}

function ownsRow(row, orgId) {
  if (!row || !orgId) return false;

  const rowOrgId = row.org_id == null ? null : String(row.org_id);
  const rowTenantId = row.tenant_id == null ? null : String(row.tenant_id);
  const wanted = String(orgId);

  return rowOrgId === wanted || (rowOrgId == null && rowTenantId === wanted);
}

function makeSupabaseClient(token, useServiceRole = false) {
  const key = useServiceRole ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !key) return null;

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  return createClient(SUPABASE_URL, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: { headers },
  });
}

async function getUserFromToken(token) {
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "missing_token",
      details: "Missing bearer token",
    };
  }

  const sbAuth =
    makeSupabaseClient(token, false) ||
    makeSupabaseClient(token, true);

  if (!sbAuth) {
    return {
      ok: false,
      status: 500,
      error: "missing_supabase_env",
      details: "Supabase env vars are not configured",
    };
  }

  const { data, error } = await sbAuth.auth.getUser(token);

  if (error || !data?.user?.id) {
    return {
      ok: false,
      status: 401,
      error: "invalid_token",
      details: error?.message || "Unable to resolve user from token",
    };
  }

  return { ok: true, user: data.user, sbUser: sbAuth };
}

async function resolveMembership(sbClient, userId, orgId) {
  if (!sbClient) return null;

  if (orgId) {
    const { data, error } = await sbClient
      .from("memberships")
      .select("org_id, role, is_default, revoked_at")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .is("revoked_at", null)
      .maybeSingle();

    if (!error && data?.org_id) return data;
  }

  const { data, error } = await sbClient
    .from("memberships")
    .select("org_id, role, is_default, revoked_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!error && data?.org_id) return data;
  return null;
}

async function resolveContext(req, { requestedOrgId } = {}) {
  const token = getBearerToken(req);
  const authRes = await getUserFromToken(token);
  if (!authRes.ok) return authRes;

  const { user, sbUser } = authRes;
  const sbSrv = makeSupabaseClient(null, true);

  const currentOrgId =
    String(
      requestedOrgId ||
        req?.headers?.["x-org-id"] ||
        getCookie(req, "current_org_id") ||
        ""
    ).trim() || null;

  const membership =
    (await resolveMembership(sbSrv, user.id, currentOrgId)) ||
    (await resolveMembership(sbUser, user.id, currentOrgId));

  if (!membership?.org_id) {
    return {
      ok: false,
      status: 403,
      error: "no_membership",
      details: "User has no active membership",
    };
  }

  return {
    ok: true,
    ctx: {
      org_id: String(membership.org_id),
      role: String(membership.role || "member"),
    },
    user,
    sbDb: sbSrv || sbUser,
  };
}

async function listGeofences(sbDb, orgId, onlyActive) {
  const items = [];
  const seen = new Set();

  let q1 = sbDb.from("geofences").select("*").eq("org_id", orgId);
  if (onlyActive) q1 = q1.eq("active", true);

  const r1 = await q1.order("name", { ascending: true });
  if (r1.error) throw r1.error;

  for (const row of r1.data || []) {
    const id = row?.id ? String(row.id) : JSON.stringify(row);
    if (!seen.has(id)) {
      seen.add(id);
      items.push(row);
    }
  }

  let q2 = sbDb
    .from("geofences")
    .select("*")
    .is("org_id", null)
    .eq("tenant_id", orgId);

  if (onlyActive) q2 = q2.eq("active", true);

  const r2 = await q2.order("name", { ascending: true });

  if (!r2.error) {
    for (const row of r2.data || []) {
      const id = row?.id ? String(row.id) : JSON.stringify(row);
      if (!seen.has(id)) {
        seen.add(id);
        items.push(row);
      }
    }
  }

  items.sort((a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || ""))
  );

  return items;
}

async function countReferences(sbDb, table, id) {
  const checks = ["geofence_id", "geocerca_id"];

  for (const col of checks) {
    const { count, error } = await sbDb
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(col, id);

    if (error) {
      const message = String(error.message || "").toLowerCase();
      const missingColumn =
        message.includes(`column "${col}" does not exist`) ||
        message.includes(`could not find the '${col}' column`) ||
        error.code === "42703";

      if (missingColumn) continue;

      throw new Error(`${table}:${col}:${error.message}`);
    }

    if (Number(count || 0) > 0) return true;
  }

  return false;
}

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

    if (!ctxRes.ok) {
      return send(res, ctxRes.status, {
        ok: false,
        error: ctxRes.error,
        details: ctxRes.details,
      });
    }

    const { ctx, sbDb, user } = ctxRes;
    const org_id = String(ctx.org_id);
    const user_id = String(user.id);

    if (req.method === "GET") {
      const action = String(q.action || "list").toLowerCase();

      if (action === "list") {
        const onlyActive = q.onlyActive === "true" || q.onlyActive === true;
        const items = await listGeofences(sbDb, org_id, onlyActive);
        return ok(res, { ok: true, items });
      }

      if (action === "get") {
        const id = String(q.id || "").trim();
        if (!id) {
          return send(res, 400, { ok: false, error: "missing_id" });
        }

        const { data, error } = await sbDb
          .from("geofences")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (error) {
          return send(res, 500, {
            ok: false,
            error: "supabase_error",
            details: error.message,
          });
        }

        if (!data?.id || !ownsRow(data, org_id)) {
          return send(res, 404, { ok: false, error: "not_found" });
        }

        return ok(res, { ok: true, item: data });
      }

      return send(res, 400, { ok: false, error: "invalid_action" });
    }

    if (req.method === "POST") {
      const rawPayload = await readBody(req);
      const action = String(rawPayload?.action || "upsert").toLowerCase();
      const payload = stripServerOwned(rawPayload);

      if (action === "upsert") {
        const explicitOrgId = String(
          rawPayload?.org_id || rawPayload?.orgId || ""
        ).trim();

        if (explicitOrgId && explicitOrgId !== org_id) {
          return send(res, 403, {
            ok: false,
            error: "org_id_mismatch",
            message: "org_id del payload no coincide con la organización activa.",
          });
        }

        const clean = pickAllowed(payload);

        const normalizedGeojson =
          ensureFeatureCollection(clean.geojson) ||
          ensureFeatureCollection(clean.polygon_geojson) ||
          (clean.lat !== undefined && clean.lng !== undefined
            ? buildPointFC(clean.lat, clean.lng)
            : null);

        if (!normalizedGeojson) {
          return send(res, 400, {
            ok: false,
            error: "missing_geometry",
            message: "Debe enviar geojson/polygon_geojson o lat/lng.",
          });
        }

        const now = new Date().toISOString();

        const row = {
          ...clean,
          org_id,
          user_id,
          geojson: normalizedGeojson,
          active: clean.active ?? true,
          is_default: clean.is_default ?? false,
          updated_at: now,
          updated_by: user_id,
        };

        let savedRow = null;

        if (!row.id) {
          const { data, error } = await sbDb
            .from("geofences")
            .insert({
              ...row,
              created_at: now,
              created_by: user_id,
            })
            .select("*")
            .single();

          if (error) {
            return send(res, 500, {
              ok: false,
              error: "insert_failed",
              details: error.message,
            });
          }

          savedRow = data;
        } else {
          const { data: existing, error: existingErr } = await sbDb
            .from("geofences")
            .select("id, org_id, tenant_id")
            .eq("id", row.id)
            .maybeSingle();

          if (existingErr) {
            return send(res, 500, {
              ok: false,
              error: "existing_lookup_failed",
              details: existingErr.message,
            });
          }

          if (!existing?.id || !ownsRow(existing, org_id)) {
            return send(res, 403, {
              ok: false,
              error: "forbidden",
              message: "No ownership or not found",
            });
          }

          const updateRow = { ...row };
          delete updateRow.id;

          const { data, error } = await sbDb
            .from("geofences")
            .update(updateRow)
            .eq("id", row.id)
            .select("*")
            .single();

          if (error) {
            return send(res, 500, {
              ok: false,
              error: "update_failed",
              details: error.message,
            });
          }

          savedRow = data;
        }

        return ok(res, { ok: true, item: savedRow });
      }

      if (action === "delete") {
        const id = String(payload?.id || "").trim();
        if (!id) {
          return send(res, 400, { ok: false, error: "missing_id" });
        }

        const { data: gf, error: gfErr } = await sbDb
          .from("geofences")
          .select("id, org_id, tenant_id")
          .eq("id", id)
          .maybeSingle();

        if (gfErr) {
          return send(res, 500, {
            ok: false,
            error: "supabase_error",
            details: gfErr.message,
          });
        }

        if (!gf?.id || !ownsRow(gf, org_id)) {
          return send(res, 403, {
            ok: false,
            error: "forbidden",
            message: "No ownership or not found",
          });
        }

        const refTables = [
          "asignaciones",
          "tracker_assignments",
          "attendance_events",
          "geofence_events",
          "geofence_members",
          "position_events",
          "user_geofence_state",
        ];

        let hasReferences = false;

        for (const table of refTables) {
          try {
            if (await countReferences(sbDb, table, id)) {
              hasReferences = true;
              break;
            }
          } catch (err) {
            console.error("[api/geofences delete] refs error", {
              table,
              message: err?.message,
            });

            return send(res, 500, {
              ok: false,
              error: `supabase_error_in_${table}`,
              details: String(err?.message || err),
            });
          }
        }

        const now = new Date().toISOString();

        if (hasReferences) {
          const { error } = await sbDb
            .from("geofences")
            .update({
              active: false,
              updated_at: now,
              updated_by: user_id,
            })
            .eq("id", id);

          if (error) {
            return send(res, 500, {
              ok: false,
              error: "soft_delete_failed",
              details: error.message,
            });
          }

          return ok(res, {
            ok: true,
            mode: "deactivated",
            reason: "has_references",
          });
        }

        const { error: deleteError } = await sbDb
          .from("geofences")
          .delete()
          .eq("id", id);

        if (deleteError) {
          const message = String(deleteError.message || "").toLowerCase();
          const looksLikeFk =
            String(deleteError.code || "").toLowerCase().includes("foreign") ||
            message.includes("foreign key") ||
            message.includes("violates foreign key");

          if (looksLikeFk) {
            const { error: softErr } = await sbDb
              .from("geofences")
              .update({
                active: false,
                updated_at: now,
                updated_by: user_id,
              })
              .eq("id", id);

            if (softErr) {
              return send(res, 500, {
                ok: false,
                error: "soft_delete_failed",
                details: softErr.message,
              });
            }

            return ok(res, {
              ok: true,
              mode: "deactivated",
              reason: "fk_blocked",
            });
          }

          return send(res, 500, {
            ok: false,
            error: "delete_failed",
            details: deleteError.message,
          });
        }

        return ok(res, { ok: true, mode: "deleted" });
      }

      return send(res, 400, { ok: false, error: "invalid_action" });
    }

    return send(res, 405, {
      ok: false,
      error: "method_not_allowed",
      method: req.method,
    });
  } catch (err) {
    console.error("[api/geofences]", {
      message: err?.message,
      stack: err?.stack,
      code: err?.code,
      details: err?.details,
      hint: err?.hint,
    });

    return send(res, 500, {
      ok: false,
      error: "server_error",
      details: String(err?.message || err),
    });
  }
}