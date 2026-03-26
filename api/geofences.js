// api/geofences.js
import { createClient } from "@supabase/supabase-js";

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
        // ...existing code...
        // ...existing code for upsert...
        // ...existing code...
      }

      if (action === "delete") {
        // BLINDAJE TOTAL DELETE
        try {
          console.log("[api/geofences delete] start", { method: req.method, body: payload, query: q });
          // 1. Validar id
          const id = payload?.id ? String(payload.id) : null;
          if (!id) return send(res, 400, { ok: false, error: "missing_id" });

          // 2. Resolver orgId seguro
          const orgId = String(payload?.org_id || payload?.orgId || q?.org_id || q?.orgId || "");
          if (!orgId) return send(res, 400, { ok: false, error: "missing_org_id" });

          // 3. Validar ownership seguro por org_id
          const { data: gf, error: gfErr } = await sbDb.from("geofences").select("id,org_id").eq("id", id).maybeSingle();
          if (gfErr) return send(res, 500, { ok: false, error: "Supabase error", details: gfErr.message });
          if (!gf?.id || String(gf.org_id) !== String(orgId)) {
            return send(res, 403, { ok: false, error: "forbidden", message: "No ownership or not found" });
          }

          // 4. Verificar referencias en paralelo y con logs
          const refTables = [
            "asignaciones",
            "tracker_assignments",
            "attendance_events",
            "geofence_events",
            "geofence_members",
            "position_events",
            "user_geofence_state"
          ];
          const refChecks = refTables.map(async (table) => {
            try {
              const { data: rows, error } = await sbDb.from(table).select("id").eq("geofence_id", id).limit(1);
              if (error) {
                console.error("[api/geofences delete] refs error", { table, message: error?.message, code: error?.code, details: error?.details, hint: error?.hint });
                return { table, error };
              }
              return { table, hasRefs: Array.isArray(rows) && rows.length > 0 };
            } catch (error) {
              console.error("[api/geofences delete] refs error", { table, message: error?.message, code: error?.code, details: error?.details, hint: error?.hint });
              return { table, error };
            }
          });
          const refResults = await Promise.all(refChecks);
          const hasReferences = refResults.some(r => r.hasRefs);

          // 5. Si hay referencias: soft delete
          if (hasReferences) {
            await sbDb.from("geofences").update({ active: false, updated_at: new Date().toISOString() }).eq("id", id).eq("org_id", orgId);
            return ok(res, { ok: true, mode: "deactivated", reason: "has_references" });
          }

          // 6. Si no hay referencias: intentar delete real
          try {
            await sbDb.from("geofences").delete().eq("id", id).eq("org_id", orgId);
            return ok(res, { ok: true, mode: "deleted" });
          } catch (error) {
            // 7. Si delete real falla por FK, fallback a soft delete
            if (error?.code && String(error.code).toLowerCase().includes("foreign")) {
              await sbDb.from("geofences").update({ active: false, updated_at: new Date().toISOString() }).eq("id", id).eq("org_id", orgId);
              return ok(res, { ok: true, mode: "deactivated", reason: "fk_blocked" });
            }
            throw error;
          }
        } catch (error) {
          console.error("[api/geofences] fatal", {
            message: error?.message,
            code: error?.code,
            details: error?.details,
            hint: error?.hint,
            stack: error?.stack
          });
          return send(res, 500, { ok: false, error: "server_error", details: String(error?.message || error) });
        }
      }

      return send(res, 400, { ok: false, error: "Unsupported action", action });
    }

    res.setHeader("Allow", "GET,POST,OPTIONS,HEAD");
    return send(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    console.error("[api/geofences] fatal", {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      stack: error?.stack
    });
    return send(res, 500, { ok: false, error: "server_error", details: String(error?.message || error) });
  }
}
