import { createClient } from "@supabase/supabase-js";

const VERSION = "asignaciones-direct-sync-05";

function setHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PATCH,DELETE");
  res.setHeader("X-Api-Version", VERSION);
}

function send(res, status, payload) {
  setHeaders(res);
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

function getEnv(nameList) {
  for (const n of nameList) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

function parseCookie(cookieHeader, key) {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${key}=([^;]+)`));
  if (!m || !m[1]) return null;
  const raw = m[1];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function toDateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateOnlyOrNull(value) {
  const d = toDateOrNull(value);
  return d ? d.toISOString().slice(0, 10) : null;
}

function rangesOverlapInclusive(startA, endA, startB, endB) {
  return startA <= endB && endA >= startB;
}

function buildWritableFields(incoming) {
  const allowed = [
    "tenant_id",
    "org_id",
    "personal_id",
    "org_people_id",
    "geofence_id",
    "geocerca_id",
    "activity_id",
    "start_time",
    "end_time",
    "status",
    "estado",
    "frecuencia_envio_sec",
    "frequency_minutes",
    "user_id",
  ];

  const fields = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      fields[key] = incoming[key];
    }
  }
  return fields;
}

function normalizeActiveStatus(row) {
  const s1 = String(row?.status || "").toLowerCase();
  const s2 = String(row?.estado || "").toLowerCase();
  return s1 === "active" || s1 === "activa" || s2 === "active" || s2 === "activa";
}

function normalizeFrequencyMinutes(row) {
  const fm = Number(row?.frequency_minutes);
  if (Number.isFinite(fm) && fm > 0) return Math.round(fm);

  const fs = Number(row?.frecuencia_envio_sec);
  if (Number.isFinite(fs) && fs > 0) return Math.max(1, Math.round(fs / 60));

  return 5;
}

async function findOverlap(supabase, { currentId = null, orgId, personalId, startTime, endTime }) {
  if (!orgId || !personalId || !startTime || !endTime) return null;

  const newStart = toDateOrNull(startTime);
  const newEnd = toDateOrNull(endTime);

  if (!newStart || !newEnd) return { error: "invalid_datetime" };
  if (newStart >= newEnd) return { error: "invalid_range" };

  const { data: rows, error } = await supabase
    .from("asignaciones")
    .select("id, org_id, personal_id, start_time, end_time, is_deleted")
    .eq("org_id", orgId)
    .eq("personal_id", personalId)
    .eq("is_deleted", false);

  if (error) return { error: error.message };

  const currentIdNorm = currentId ? String(currentId) : null;

  for (const row of rows || []) {
    if (!row?.id) continue;
    if (currentIdNorm && String(row.id) === currentIdNorm) continue;
    if (!row.start_time || !row.end_time) continue;

    const rowStart = toDateOrNull(row.start_time);
    const rowEnd = toDateOrNull(row.end_time);
    if (!rowStart || !rowEnd) continue;

    if (rangesOverlapInclusive(rowStart, rowEnd, newStart, newEnd)) {
      return {
        conflict: row,
        debug: {
          current_id: currentIdNorm,
          conflict_id: row.id,
          org_id: orgId,
          personal_id: personalId,
          start_time: newStart.toISOString(),
          end_time: newEnd.toISOString(),
          conflicting_start_time: row.start_time,
          conflicting_end_time: row.end_time,
        },
      };
    }
  }

  return null;
}

async function resolvePersonalUserId(supabase, { orgId, personalId }) {
  if (!orgId || !personalId) {
    return { userId: null, error: "missing_org_or_personal_id" };
  }

  const { data, error } = await supabase
    .from("personal")
    .select("id, org_id, user_id, email, is_deleted")
    .eq("id", personalId)
    .eq("org_id", orgId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error) return { userId: null, error: error.message };
  if (!data) return { userId: null, error: "personal_not_found" };

  return { userId: data.user_id || null, error: null };
}

async function resolveGeocercaIdFromGeofence(supabase, { orgId, geofenceId }) {
  if (!orgId || !geofenceId) {
    return { geocercaId: null, error: "missing_org_or_geofence_id" };
  }

  const { data: gf, error: gfError } = await supabase
    .from("geofences")
    .select("id, name, org_id")
    .eq("id", geofenceId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (gfError) return { geocercaId: null, error: gfError.message };
  if (!gf?.name) return { geocercaId: null, error: "geofence_not_found" };

  const { data: gz, error: gzError } = await supabase
    .from("geocercas")
    .select("id, nombre, org_id")
    .eq("org_id", orgId)
    .eq("nombre", gf.name)
    .maybeSingle();

  if (gzError) return { geocercaId: null, error: gzError.message };
  if (!gz?.id) return { geocercaId: null, error: "matching_geocerca_not_found" };

  return { geocercaId: gz.id, error: null };
}

async function resolveTenantId(supabase, { orgId, incomingTenantId = null }) {
  if (incomingTenantId) {
    return { tenantId: incomingTenantId, error: null, mode: "incoming" };
  }

  if (!orgId) {
    return { tenantId: null, error: "missing_org_id_for_tenant" };
  }

  const byId = await supabase
    .from("tenants")
    .select("id")
    .eq("id", orgId)
    .maybeSingle();

  if (!byId.error && byId.data?.id) {
    return { tenantId: byId.data.id, error: null, mode: "tenant_id_equals_org_id" };
  }

  const candidates = ["org_id", "organization_id"];
  for (const column of candidates) {
    try {
      const { data, error } = await supabase
        .from("tenants")
        .select("id")
        .eq(column, orgId)
        .maybeSingle();

      if (!error && data?.id) {
        return { tenantId: data.id, error: null, mode: `tenants.${column}` };
      }
    } catch {
      // Try next possible schema.
    }
  }

  return {
    tenantId: null,
    error: "tenant_not_found_for_org",
    details: { orgId, byIdError: byId.error?.message || null },
  };
}

function createAdminSupabase(SUPABASE_URL) {
  const serviceKey = getEnv([
    "SUPABASE_SERVICE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);

  if (!SUPABASE_URL || !serviceKey) return null;

  return createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
}

async function syncTrackerAssignment(adminSupabase, row) {
  if (!adminSupabase) {
    return { ok: false, error: "missing_service_role_key" };
  }

  const orgId = row?.org_id || null;
  const trackerUserId = row?.user_id || null;
  const geofenceId = row?.geofence_id || null;
  const activityId = row?.activity_id || null;
  const startDate = toDateOnlyOrNull(row?.start_time);
  const endDate = toDateOnlyOrNull(row?.end_time);
  const active = normalizeActiveStatus(row);
  const frequencyMinutes = normalizeFrequencyMinutes(row);

  if (!orgId || !trackerUserId || !geofenceId || !startDate || !endDate) {
    return {
      ok: false,
      error: "missing_sync_fields",
      details: { orgId, trackerUserId, geofenceId, activityId, startDate, endDate },
    };
  }

  let deleteError = null;
  try {
    const deleteQuery = adminSupabase
      .from("tracker_assignments")
      .delete()
      .eq("org_id", orgId)
      .eq("tracker_user_id", trackerUserId)
      .eq("geofence_id", geofenceId);

    const deleteScopedQuery =
      activityId == null ? deleteQuery.is("activity_id", null) : deleteQuery.eq("activity_id", activityId);

    const { error } = await deleteScopedQuery;
    if (error) deleteError = error;
  } catch (err) {
    deleteError = err;
  }

  if (deleteError) {
    console.error("[SYNC DELETE ERROR]", deleteError);
    return { ok: false, error: "delete_failed", details: deleteError };
  }

  let insertError = null;
  let data = null;
  try {
    const insertPayload = {
      tenant_id: orgId,
      org_id: orgId,
      tracker_user_id: trackerUserId,
      geofence_id: geofenceId,
      activity_id: activityId,
      start_date: startDate,
      end_date: endDate,
      frequency_minutes: frequencyMinutes,
      active,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log("[SYNC INSERT]", insertPayload);

    const result = await adminSupabase
      .from("tracker_assignments")
      .insert([insertPayload])
      .select("id")
      .single();

    data = result.data;
    if (result.error) insertError = result.error;
  } catch (err) {
    insertError = err;
  }

  if (insertError) {
    console.error("[SYNC INSERT ERROR]", insertError);
    return { ok: false, error: "insert_failed", details: insertError };
  }

  return { ok: true, id: data?.id || null, mode: "delete_insert" };
}

export default async function handler(req, res) {
  try {
    const q = req.query || {};
    const { method } = req;

    const SUPABASE_URL = getEnv([
      "SUPABASE_URL",
      "VITE_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
    ]);

    const SUPABASE_ANON_KEY = getEnv([
      "SUPABASE_ANON_KEY",
      "SUPABASE_ANON_PUBLIC",
      "VITE_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return send(res, 500, {
        ok: false,
        error: "Server misconfigured: missing Supabase env vars (SUPABASE_URL / SUPABASE_ANON_KEY)",
        details: {
          hasUrl: Boolean(SUPABASE_URL),
          hasAnonKey: Boolean(SUPABASE_ANON_KEY),
        },
      });
    }

    const cookieHeader = req.headers.cookie || "";
    let token = parseCookie(cookieHeader, "tg_at");

    if (!token) {
      const authHeader = req.headers.authorization || "";
      if (authHeader.toLowerCase().startsWith("bearer ")) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      return send(res, 401, {
        ok: false,
        error: "Missing authentication (cookie tg_at or Authorization Bearer)",
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const adminSupabase = createAdminSupabase(SUPABASE_URL);

    if (method === "OPTIONS") {
      setHeaders(res);
      res.statusCode = 204;
      return res.end();
    }

    if (method === "HEAD") {
      setHeaders(res);
      res.statusCode = 200;
      return res.end();
    }

    if (method === "DELETE") {
      const { id } = req.body || {};
      if (!id) return send(res, 400, { ok: false, error: "missing_id" });

      const { error } = await supabase
        .from("asignaciones")
        .update({ is_deleted: true })
        .eq("id", id)
        .eq("is_deleted", false);

      if (error) return send(res, 500, { ok: false, error: error.message });
      return send(res, 200, { ok: true });
    }

    if (method === "POST") {
      const incoming = req.body || {};
      const insertFields = buildWritableFields(incoming);
      const { personal_id, org_id, start_time, end_time } = insertFields;

      if (!org_id || !personal_id || !start_time || !end_time) {
        return send(res, 400, { ok: false, error: "missing_required_fields" });
      }

      const resolvedTenant = await resolveTenantId(supabase, {
        orgId: org_id,
        incomingTenantId: insertFields.tenant_id,
      });

      if (resolvedTenant.error) {
        return send(res, 400, {
          ok: false,
          error: resolvedTenant.error,
          details: resolvedTenant.details || null,
        });
      }

      insertFields.tenant_id = resolvedTenant.tenantId;

      if (!insertFields.geocerca_id && insertFields.geofence_id) {
        const resolvedGeocerca = await resolveGeocercaIdFromGeofence(supabase, {
          orgId: org_id,
          geofenceId: insertFields.geofence_id,
        });

        if (resolvedGeocerca.error) {
          return send(res, 400, {
            ok: false,
            error: resolvedGeocerca.error,
          });
        }

        insertFields.geocerca_id = resolvedGeocerca.geocercaId;
      }

      const overlapCheck = await findOverlap(supabase, {
        orgId: org_id,
        personalId: personal_id,
        startTime: start_time,
        endTime: end_time,
      });

      if (overlapCheck?.error === "invalid_datetime") {
        return send(res, 400, { ok: false, error: "invalid_datetime" });
      }

      if (overlapCheck?.error === "invalid_range") {
        return send(res, 400, {
          ok: false,
          error: "invalid_range",
          message: "start_time debe ser menor que end_time",
        });
      }

      if (overlapCheck?.error) {
        return send(res, 500, { ok: false, error: overlapCheck.error });
      }

      if (overlapCheck?.conflict) {
        return send(res, 409, {
          ok: false,
          error: "overlap",
          conflict_id: overlapCheck.conflict.id,
        });
      }

      const resolvedUser = await resolvePersonalUserId(supabase, {
        orgId: org_id,
        personalId: personal_id,
      });

      if (!resolvedUser.error) {
        insertFields.user_id = resolvedUser.userId;
      }

      const { data, error } = await supabase
        .from("asignaciones")
        .insert([insertFields])
        .select()
        .single();

      if (error) {
        if (error.code === "23P01") {
          return send(res, 409, { ok: false, error: "overlap" });
        }
        return send(res, 500, { ok: false, error: error.message });
      }

      const syncResult = await syncTrackerAssignment(adminSupabase, data);
      if (!syncResult.ok) {
        console.warn("[SYNC SKIPPED POST]", syncResult.error, syncResult.details || null);
      }

      return send(res, 201, {
        ok: true,
        asignacion: data,
        tracker_sync_ok: syncResult.ok,
        tracker_sync_error: syncResult.ok ? null : syncResult.error,
        tracker_sync_mode: syncResult.mode || null,
        tracker_assignment_id: syncResult.id || null,
      });
    }

    if (method === "PATCH") {
      const incoming = req.body || {};
      const { id } = incoming;

      if (!id) {
        return send(res, 400, { ok: false, error: "missing_id" });
      }

      const { data: currentRow, error: fetchError } = await supabase
        .from("asignaciones")
        .select("id, org_id, tenant_id, personal_id, user_id, geofence_id, geocerca_id, activity_id, start_time, end_time, status, estado, frequency_minutes, frecuencia_envio_sec, is_deleted")
        .eq("id", id)
        .eq("is_deleted", false)
        .single();

      if (fetchError || !currentRow) {
        return send(res, 404, { ok: false, error: "not_found" });
      }

      const updateFields = buildWritableFields(incoming);

      const nextOrgId = Object.prototype.hasOwnProperty.call(updateFields, "org_id")
        ? updateFields.org_id
        : currentRow.org_id;

      const nextPersonalId = Object.prototype.hasOwnProperty.call(updateFields, "personal_id")
        ? updateFields.personal_id
        : currentRow.personal_id;

      const nextStartTime = Object.prototype.hasOwnProperty.call(updateFields, "start_time")
        ? updateFields.start_time
        : currentRow.start_time;

      const nextEndTime = Object.prototype.hasOwnProperty.call(updateFields, "end_time")
        ? updateFields.end_time
        : currentRow.end_time;

      const resolvedTenant = await resolveTenantId(supabase, {
        orgId: nextOrgId,
        incomingTenantId: updateFields.tenant_id || currentRow.tenant_id,
      });

      if (resolvedTenant.error) {
        return send(res, 400, {
          ok: false,
          error: resolvedTenant.error,
          details: resolvedTenant.details || null,
        });
      }

      updateFields.tenant_id = resolvedTenant.tenantId;

      if (!nextStartTime || !nextEndTime) {
        return send(res, 400, {
          ok: false,
          error: "invalid_range",
          message: "start_time y end_time son obligatorios",
        });
      }

      const startDate = toDateOrNull(nextStartTime);
      const endDate = toDateOrNull(nextEndTime);

      if (!startDate || !endDate) {
        return send(res, 400, { ok: false, error: "invalid_datetime" });
      }

      if (startDate >= endDate) {
        return send(res, 400, {
          ok: false,
          error: "invalid_range",
          message: "start_time debe ser menor que end_time",
        });
      }

      if (nextOrgId && nextPersonalId) {
        const overlapCheck = await findOverlap(supabase, {
          currentId: currentRow.id,
          orgId: nextOrgId,
          personalId: nextPersonalId,
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        });

        if (overlapCheck?.error) {
          if (overlapCheck.error === "invalid_datetime") {
            return send(res, 400, { ok: false, error: "invalid_datetime" });
          }
          if (overlapCheck.error === "invalid_range") {
            return send(res, 400, {
              ok: false,
              error: "invalid_range",
              message: "start_time debe ser menor que end_time",
            });
          }
          return send(res, 500, { ok: false, error: overlapCheck.error });
        }

        if (overlapCheck?.conflict) {
          return send(res, 409, {
            ok: false,
            error: "overlap",
            conflict_id: overlapCheck.conflict.id,
          });
        }
      }

      if (!updateFields.geocerca_id) {
        const geofenceIdToUse = updateFields.geofence_id || currentRow.geofence_id;
        if (geofenceIdToUse) {
          const resolvedGeocerca = await resolveGeocercaIdFromGeofence(supabase, {
            orgId: nextOrgId,
            geofenceId: geofenceIdToUse,
          });

          if (resolvedGeocerca.error) {
            return send(res, 400, {
              ok: false,
              error: resolvedGeocerca.error,
            });
          }

          updateFields.geocerca_id = resolvedGeocerca.geocercaId;
        }
      }

      if (nextOrgId && nextPersonalId) {
        const resolvedUser = await resolvePersonalUserId(supabase, {
          orgId: nextOrgId,
          personalId: nextPersonalId,
        });

        if (!resolvedUser.error) {
          updateFields.user_id = resolvedUser.userId;
        }
      }

      if (Object.keys(updateFields).length === 0) {
        return send(res, 400, { ok: false, error: "no_fields_to_update" });
      }

      const { data, error } = await supabase
        .from("asignaciones")
        .update(updateFields)
        .eq("id", id)
        .eq("is_deleted", false)
        .select()
        .single();

      if (error) {
        if (error.code === "23P01") {
          return send(res, 409, { ok: false, error: "overlap" });
        }
        return send(res, 500, { ok: false, error: error.message });
      }

      const syncResult = await syncTrackerAssignment(adminSupabase, data);
      if (!syncResult.ok) {
        console.warn("[SYNC SKIPPED PATCH]", syncResult.error, syncResult.details || null);
      }

      return send(res, 200, {
        ok: true,
        asignacion: data,
        tracker_sync_ok: syncResult.ok,
        tracker_sync_error: syncResult.ok ? null : syncResult.error,
        tracker_sync_mode: syncResult.mode || null,
        tracker_assignment_id: syncResult.id || null,
      });
    }

    if (method !== "GET") {
      return send(res, 405, {
        ok: false,
        error: "method_not_allowed",
        method,
        version: VERSION,
      });
    }

    let personal = [];
    let geofences = [];
    let activities = [];
    let asignaciones = [];
    const requested_org_id = q.org_id || q.orgId || null;

    const debug = {
      requested_org_id,
      supabase_url_host:
        supabase && supabase.restUrl
          ? (() => {
              try {
                return new URL(supabase.restUrl).host;
              } catch {
                return null;
              }
            })()
          : null,
      queries: [],
    };

    if (requested_org_id) {
      let personalError = null;
      let personalCount = 0;
      try {
        const { data, error } = await supabase
          .from("personal")
          .select("id,nombre,apellido,email,org_id,user_id")
          .eq("org_id", requested_org_id)
          .eq("is_deleted", false)
          .eq("vigente", true)
          .order("apellido", { ascending: true })
          .order("nombre", { ascending: true });

        if (!error && Array.isArray(data)) {
          personal = data;
          personalCount = data.length;
        } else {
          personalError = error ? error.message : "Unknown error";
        }
      } catch (err) {
        personalError = err?.message || String(err);
      }

      debug.queries.push({
        table: "personal",
        filters: { org_id: requested_org_id, is_deleted: false, vigente: true },
        count: personalCount,
        error: personalError,
      });

      let geofencesError = null;
      let geofencesCount = 0;
      try {
        const { data, error } = await supabase
          .from("geofences")
          .select("id,name")
          .eq("org_id", requested_org_id)
          .eq("active", true)
          .order("name", { ascending: true });

        if (!error && Array.isArray(data)) {
          geofences = data.map((g) => ({ id: g.id, name: g.name || null }));
          geofencesCount = geofences.length;
        } else {
          geofencesError = error ? error.message : "Unknown error";
        }
      } catch (err) {
        geofencesError = err?.message || String(err);
      }

      debug.queries.push({
        table: "geofences",
        filters: { org_id: requested_org_id, active: true },
        count: geofencesCount,
        error: geofencesError,
      });

      let activitiesError = null;
      let activitiesCount = 0;
      try {
        const { data, error } = await supabase
          .from("activities")
          .select("id,name")
          .eq("org_id", requested_org_id)
          .order("name", { ascending: true });

        if (!error && Array.isArray(data)) {
          activities = data;
          activitiesCount = data.length;
        } else {
          activitiesError = error ? error.message : "Unknown error";
        }
      } catch (err) {
        activitiesError = err?.message || String(err);
      }

      debug.queries.push({
        table: "activities",
        filters: { org_id: requested_org_id },
        count: activitiesCount,
        error: activitiesError,
      });

      let asignacionesError = null;
      let asignacionesCount = 0;
      try {
        const { data, error } = await supabase
          .from("asignaciones")
          .select("*")
          .eq("org_id", requested_org_id)
          .or("is_deleted.is.false,is_deleted.is.null")
          .order("created_at", { ascending: false });

        if (!error && Array.isArray(data)) {
          asignaciones = data;
          asignacionesCount = data.length;
        } else {
          asignacionesError = error ? error.message : "Unknown error";
        }
      } catch (err) {
        asignacionesError = err?.message || String(err);
      }

      debug.queries.push({
        table: "asignaciones",
        filters: { org_id: requested_org_id, is_deleted: "is false or null" },
        count: asignacionesCount,
        error: asignacionesError,
      });
    }

    return send(res, 200, {
      ok: true,
      data: {
        catalogs: {
          personal,
          geofences,
          activities,
        },
        asignaciones,
      },
      debug,
    });
  } catch (error) {
    console.error(error?.message);
    if (error?.stack) console.error(error.stack);
    return send(res, 500, {
      ok: false,
      error: error?.message || "Internal Server Error",
      version: VERSION,
    });
  }
}
