const VERSION = "asignaciones-clean-04";

function setHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  res.setHeader("X-Api-Version", VERSION);
}

function send(res, status, payload) {
  setHeaders(res);
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

import { createClient } from "@supabase/supabase-js";

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

export default async function handler(req, res) {
  try {
    const q = req.query || {};
    const { method } = req;

    // Supabase client initialization (cookie-first, bearer fallback)
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
        details: { hasUrl: Boolean(SUPABASE_URL), hasAnonKey: Boolean(SUPABASE_ANON_KEY) },
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
      return send(res, 401, { ok: false, error: "Missing authentication (cookie tg_at or Authorization Bearer)" });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    if (method === "OPTIONS") {
      return send(res, 204, {});
    }
    if (method === "HEAD") {
      setHeaders(res);
      // ...existing code...
      // Never run overlap validation with undefined user id
      if (overlapUserId && newStartDT) {
        let overlapQuery = supabase
          .from("asignaciones")
          .select("id,tracker_user_id,personal_id,start_time,end_time,start_date,end_date,period,period_tstz")
          .eq(effectiveUserField, overlapUserId)
          .eq("is_deleted", false)
          .neq("id", id);
        const { data: overlapRows, error: overlapError } = await overlapQuery;
        if (overlapError) return send(res, 500, { ok: false, error: overlapError.message });
        let foundConflict = null;
        if (Array.isArray(overlapRows)) {
          for (const a of overlapRows) {
            // ...existing code...
          }
        }
        if (foundConflict) {
          return send(res, 409, {
            ok: false,
            error: "overlap",
            message: "Ya existe otra asignación para esta persona en el rango de fechas seleccionado.",
            overlap_ids: [foundConflict.id],
            debug: {
              current_id: id,
              effective_user_field: effectiveUserField,
              effective_user_id: overlapUserId,
              new_start: newStartDT,
              new_end: newEndDT,
              conflicting_id: foundConflict.id,
              conflicting_personal_id: foundConflict.personal_id,
              conflicting_tracker_user_id: foundConflict.tracker_user_id,
              conflicting_start: (() => {
                if (foundConflict.period_tstz) {
                  const m = foundConflict.period_tstz.match(/\["(.+?)","(.+?)"[)\]]/);
                  return m && m[1] ? m[1] : null;
                } else if (foundConflict.start_time) {
                  return foundConflict.start_time;
                } else if (foundConflict.start_date) {
                  return foundConflict.start_date;
                }
                return null;
              })(),
              conflicting_end: (() => {
                if (foundConflict.period_tstz) {
                  const m = foundConflict.period_tstz.match(/\["(.+?)","(.+?)"[)\]]/);
                  return m && m[2] ? m[2] : null;
                } else if (foundConflict.end_time) {
                  return foundConflict.end_time;
                } else if (foundConflict.end_date) {
                  return foundConflict.end_date;
                }
                return null;
              })()
            }
          });
        }
      }

      // Always rebuild period column using tstzrange before saving
      // Only if start_time and end_time are present
      if (fields.start_time && fields.end_time) {
        // Format: tstzrange('start', 'end', '[)')
        // Ensure ISO strings with timezone
        const startTz = new Date(fields.start_time).toISOString();
        const endTz = new Date(fields.end_time).toISOString();
        fields.period = `tstzrange('${startTz}','${endTz}','[)')`;
      } else {
        // If not both present, remove period so triggers can handle
        delete fields.period;
      }
      if (!id) return send(res, 400, { ok: false, error: "missing_id" });

      // Si se envía status, actualizar solo status (y org_id si viene)
      if (typeof status !== "undefined") {
        if (!org_id) return send(res, 400, { ok: false, error: "missing_org_id" });
        const { data, error } = await supabase
          .from("asignaciones")
          .update({ status })
          .eq("id", id)
          .eq("org_id", org_id)
          .eq("is_deleted", false)
          .select()
          .single();
        if (error) return send(res, 500, { ok: false, error: error.message });
        if (!data) return send(res, 404, { ok: false, error: "not_found" });
        return send(res, 200, { ok: true, asignacion: data });
      }

      // Si no, actualizar otros campos (sin crear filas nuevas)
      // Validar traslape de fechas para la misma persona (excluyendo el id actual)
      // Fetch current assignment row to merge missing user fields for overlap validation
      let { tracker_user_id, personal_id, start_time, end_time, start_date, end_date, period, period_tstz } = fields;
      let existingRow = null;
      {
        const { data: row, error: rowError } = await supabase
          .from("asignaciones")
          .select("id,tracker_user_id,personal_id,start_time,end_time,start_date,end_date,period,period_tstz")
          .eq("id", id)
          .single();
        if (!rowError && row) existingRow = row;
      }
      // Merge missing user id fields from current row
      if (!tracker_user_id && existingRow && existingRow.tracker_user_id) tracker_user_id = existingRow.tracker_user_id;
      if (!personal_id && existingRow && existingRow.personal_id) personal_id = existingRow.personal_id;
      // Determine effective user field and id
      let effectiveUserField = tracker_user_id ? "tracker_user_id" : (personal_id ? "personal_id" : null);
      let overlapUserId = tracker_user_id || personal_id;
      // Use edited full datetime range if available
      let newStartDT = start_time ? new Date(start_time) : (start_date ? new Date(start_date) : null);
      let newEndDT = end_time ? new Date(end_time) : (end_date ? new Date(end_date) : newStartDT);
      let newPeriodTstz = period_tstz || null;
      // Never run overlap validation with undefined user id
      if (overlapUserId && newStartDT) {
        let overlapQuery = supabase
          .from("asignaciones")
          .select("id,tracker_user_id,personal_id,start_time,end_time,start_date,end_date,period,period_tstz")
          .eq(effectiveUserField, overlapUserId)
          .eq("is_deleted", false)
          .neq("id", id);
        const { data: overlapRows, error: overlapError } = await overlapQuery;
        if (overlapError) return send(res, 500, { ok: false, error: overlapError.message });
        let foundConflict = null;
        if (Array.isArray(overlapRows)) {
          for (const a of overlapRows) {
            // Prefer period_tstz for both, else use start_time/end_time, else fallback to date-only
            let aStartDT = null, aEndDT = null, aPeriodTstz = null;
            if (a.period_tstz) {
              // Parse tstzrange: ["2026-03-28T00:00:00+00:00","2026-03-29T00:00:00+00:00")
              const m = a.period_tstz.match(/\["(.+?)","(.+?)"[)\]]/);
              if (m && m[1]) aStartDT = new Date(m[1]);
              if (m && m[2]) aEndDT = new Date(m[2]);
              aPeriodTstz = a.period_tstz;
            } else if (a.start_time) {
              aStartDT = new Date(a.start_time);
              aEndDT = a.end_time ? new Date(a.end_time) : aStartDT;
            } else if (a.start_date) {
              aStartDT = new Date(a.start_date);
              aEndDT = a.end_date ? new Date(a.end_date) : aStartDT;
            }
            // Use new period_tstz if provided, else newStartDT/newEndDT
            let overlap = false;
            if (newPeriodTstz && aPeriodTstz) {
              // Compare ranges: overlap if (aStart < newEnd) && (aEnd > newStart)
              const mNew = newPeriodTstz.match(/\["(.+?)","(.+?)"[)\]]/);
              const nStart = mNew && mNew[1] ? new Date(mNew[1]) : null;
              const nEnd = mNew && mNew[2] ? new Date(mNew[2]) : null;
              if (nStart && nEnd && aStartDT && aEndDT) {
                overlap = aStartDT < nEnd && aEndDT > nStart;
              }
            } else if (newStartDT && newEndDT && aStartDT && aEndDT) {
              // Compare full datetime
              overlap = aStartDT < newEndDT && aEndDT > newStartDT;
            }
            // Only fallback to date-only if no time fields
            else if (a.start_date && newStartDT && a.end_date && newEndDT) {
              overlap = aStartDT <= newEndDT && aEndDT >= newStartDT;
            }
            if (overlap) {
              foundConflict = a;
              // Debug log with all relevant info
              console.log("[PATCH asignaciones] Overlap detected:", {
                current_id: id,
                effective_user_field: effectiveUserField,
                effective_user_id: overlapUserId,
                new_start: newStartDT,
                new_end: newEndDT,
                conflicting_id: a.id,
                conflicting_personal_id: a.personal_id,
                conflicting_tracker_user_id: a.tracker_user_id,
                conflicting_start: aStartDT,
                conflicting_end: aEndDT
              });
              break;
            }
          }
        }
        if (foundConflict) {
          return send(res, 409, {
            ok: false,
            error: "overlap",
            message: "Ya existe otra asignación para esta persona en el rango de fechas seleccionado.",
            overlap_ids: [foundConflict.id],
            debug: {
              current_id: id,
              effective_user_field: effectiveUserField,
              effective_user_id: overlapUserId,
              new_start: newStartDT,
              new_end: newEndDT,
              conflicting_id: foundConflict.id,
              conflicting_personal_id: foundConflict.personal_id,
              conflicting_tracker_user_id: foundConflict.tracker_user_id,
              conflicting_start: (() => {
                if (foundConflict.period_tstz) {
                  const m = foundConflict.period_tstz.match(/\["(.+?)","(.+?)"[)\]]/);
                  return m && m[1] ? m[1] : null;
                } else if (foundConflict.start_time) {
                  return foundConflict.start_time;
                } else if (foundConflict.start_date) {
                  return foundConflict.start_date;
                }
                return null;
              })(),
              conflicting_end: (() => {
                if (foundConflict.period_tstz) {
                  const m = foundConflict.period_tstz.match(/\["(.+?)","(.+?)"[)\]]/);
                  return m && m[2] ? m[2] : null;
                } else if (foundConflict.end_time) {
                  return foundConflict.end_time;
                } else if (foundConflict.end_date) {
                  return foundConflict.end_date;
                }
                return null;
              })()
            }
          });
        }
      }
      const { error } = await supabase
        .from("asignaciones")
        .update(fields)
        .eq("id", id)
        .eq("is_deleted", false);
      if (error) return send(res, 500, { ok: false, error: error.message });
      return send(res, 200, { ok: true });
    }

    if (method === "DELETE") {
      // DELETE lógico: is_deleted=true
      const { id } = req.body || {};
      if (!id) return send(res, 400, { ok: false, error: "missing_id" });
      const { error } = await supabase
        .from("asignaciones")
        .update({ is_deleted: true })
        .eq("id", id);
      if (error) return send(res, 500, { ok: false, error: error.message });
      return send(res, 200, { ok: true });
    }

    if (method !== "GET") {
      return send(res, 405, {
        ok: false,
        error: "method_not_allowed",
        method,
        version: VERSION,
      });
    }

    // GET: bundle de asignaciones y catálogos
    let personal = [];
    let geofences = [];
    let activities = [];
    let asignaciones = [];
    const requested_org_id = q.org_id || q.orgId || null;
    const debug = {
      requested_org_id,
      supabase_url_host: (supabase && supabase.restUrl) ? (() => { try { return new URL(supabase.restUrl).host; } catch { return null; } })() : null,
      queries: []
    };
    if (requested_org_id) {
      // Personal
      const personalTable = "personal";
      const personalFilters = { org_id: requested_org_id, is_deleted: false, vigente: true };
      let personalError = null;
      let personalCount = 0;
      try {
        const { data: personalData, error } = await supabase
          .from(personalTable)
          .select("id,nombre,apellido,email,org_id")
          .eq("org_id", requested_org_id)
          .eq("is_deleted", false)
          .eq("vigente", true)
          .order("apellido", { ascending: true })
          .order("nombre", { ascending: true });
        if (!error && Array.isArray(personalData)) {
          personal = personalData;
          personalCount = personal.length;
        } else {
          personal = [];
          personalError = error ? error.message : 'Unknown error';
        }
      } catch (err) {
        personal = [];
        personalError = err?.message || String(err);
      }
      debug.queries.push({ table: personalTable, filters: personalFilters, count: personalCount, error: personalError });

      // Geofences
      const geofencesTable = "geofences";
      let geofencesArr = [];
      let hasIsDeleted = false;
      let geofencesError = null;
      let geofencesCount = 0;
      let geofencesFilters = { org_id: requested_org_id, active: true };
      try {
        try {
          const { data: meta, error: metaError } = await supabase.from(geofencesTable).select("is_deleted").limit(1);
          if (!metaError && Array.isArray(meta) && meta.length > 0 && Object.prototype.hasOwnProperty.call(meta[0], "is_deleted")) {
            hasIsDeleted = true;
          }
        } catch {}
        let geofencesQuery = supabase.from(geofencesTable).select("id,name").eq("org_id", requested_org_id).eq("active", true);
        if (hasIsDeleted) {
          geofencesQuery = geofencesQuery.eq("is_deleted", false);
          geofencesFilters.is_deleted = false;
        }
        const { data: geofencesData, error } = await geofencesQuery.order("name", { ascending: true });
        if (!error && Array.isArray(geofencesData)) {
          geofencesArr = geofencesData.map(g => ({ id: g.id, name: g.name || null }));
          geofencesCount = geofencesArr.length;
        } else {
          geofencesArr = [];
          geofencesError = error ? error.message : 'Unknown error';
        }
        geofences = geofencesArr;
      } catch (err) {
        geofences = [];
        geofencesError = err?.message || String(err);
      }
      debug.queries.push({ table: geofencesTable, filters: geofencesFilters, count: geofencesCount, error: geofencesError });

      // Activities
      const activitiesTable = "activities";
      const activitiesFilters = { org_id: requested_org_id };
      let activitiesError = null;
      let activitiesCount = 0;
      try {
        const { data: activitiesData, error } = await supabase
          .from(activitiesTable)
          .select("id,name")
          .eq("org_id", requested_org_id)
          .order("name", { ascending: true });
        if (!error && Array.isArray(activitiesData)) {
          activities = activitiesData;
          activitiesCount = activities.length;
        } else {
          activities = [];
          activitiesError = error ? error.message : 'Unknown error';
        }
      } catch (err) {
        activities = [];
        activitiesError = err?.message || String(err);
      }
      debug.queries.push({ table: activitiesTable, filters: activitiesFilters, count: activitiesCount, error: activitiesError });

      // Assignments (tracker_assignments)
      const assignmentsTable = "tracker_assignments";
      const assignmentsFilters = { org_id: requested_org_id, is_deleted: 'is false or null' };
      let assignmentsError = null;
      let assignmentsCount = 0;
      try {
        const { data: assignmentsData, error } = await supabase
          .from(assignmentsTable)
          .select("*")
          .eq("org_id", requested_org_id)
          .or("is_deleted.is.false,is_deleted.is.null")
          .order("created_at", { ascending: false });
        if (!error && Array.isArray(assignmentsData)) {
          asignaciones = assignmentsData;
          assignmentsCount = asignaciones.length;
        } else {
          asignaciones = [];
          assignmentsError = error ? error.message : 'Unknown error';
        }
      } catch (err) {
        asignaciones = [];
        assignmentsError = err?.message || String(err);
      }
      debug.queries.push({ table: assignmentsTable, filters: assignmentsFilters, count: assignmentsCount, error: assignmentsError });
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
    return send(res, 500, { ok: false, error: error?.message || "Internal Server Error" });
  }
}