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

export default async function handler(req, res) {
  try {
    const q = req.query || {};
    const { method } = req;

    if (method === "OPTIONS") {
      return send(res, 204, {});
    }
    if (method === "HEAD") {
      setHeaders(res);
      res.statusCode = 200;
      return res.end();
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);


    if (method === "POST") {
      // POST: crear nueva asignación (no confiar en tenant_id del frontend)
      const rawFields = req.body || {};
      // Nunca confiar en tenant_id del frontend
      const { tenant_id: _ignoreTenantId, ...fieldsNoTenant } = rawFields;

      // org_id debe venir del query o sesión
      const org_id = q.org_id || q.orgId || fieldsNoTenant.org_id || null;
      if (!org_id) {
        return send(res, 400, { ok: false, error: "missing_org_id" });
      }

      // Si se requiere tenant_id, resolverlo aquí (ejemplo: buscar en tabla tenants)
      let resolvedTenantId = null;
      if (fieldsNoTenant.tenant_lookup_key) {
        // Ejemplo: buscar tenant por clave
        const { data: tenantRow, error: tenantError } = await supabase
          .from("tenants")
          .select("id")
          .eq("lookup_key", fieldsNoTenant.tenant_lookup_key)
          .eq("org_id", org_id)
          .single();
        if (tenantError || !tenantRow) {
          return send(res, 400, { ok: false, error: "tenant_not_found" });
        }
        resolvedTenantId = tenantRow.id;
      }

      // Construir payload final sin tenant_id del frontend
      const insertPayload = {
        ...fieldsNoTenant,
        org_id,
        ...(resolvedTenantId ? { tenant_id: resolvedTenantId } : {}),
      };

      // Eliminar tenant_lookup_key del insert
      delete insertPayload.tenant_lookup_key;

      const { data, error } = await supabase
        .from("asignaciones")
        .insert([insertPayload])
        .select()
        .single();
      if (error) return send(res, 500, { ok: false, error: error.message });
      return send(res, 201, { ok: true, asignacion: data });
    }

    if (method === "PATCH") {
      // PATCH: editar asignación o cambiar estado
      const { id, status, org_id, ...fields } = req.body || {};
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
      // Overlap validation: exclude current id, use full datetime ranges if available
      const { tracker_user_id, personal_id, start_time, end_time, start_date, end_date, period, period_tstz } = fields;
      const overlapUserId = tracker_user_id || personal_id;
      // Use edited full datetime range if available
      let newStartDT = start_time ? new Date(start_time) : (start_date ? new Date(start_date) : null);
      let newEndDT = end_time ? new Date(end_time) : (end_date ? new Date(end_date) : newStartDT);
      let newPeriodTstz = period_tstz || null;
      if (overlapUserId && newStartDT) {
        let overlapQuery = supabase
          .from("asignaciones")
          .select("id,tracker_user_id,personal_id,start_time,end_time,start_date,end_date,period,period_tstz")
          .eq(tracker_user_id ? "tracker_user_id" : "personal_id", overlapUserId)
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
                tracker_user_id: tracker_user_id,
                old_range: { start: aStartDT, end: aEndDT, period: a.period, period_tstz: a.period_tstz },
                new_range: { start: newStartDT, end: newEndDT, period, period_tstz: newPeriodTstz },
                conflicting_id: a.id
              });
              break;
            }
          }
        }
        if (foundConflict) {
          return send(res, 409, { ok: false, error: "overlap", message: "Ya existe otra asignación para esta persona en el rango de fechas seleccionado.", overlap_ids: [foundConflict.id] });
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
    if (requested_org_id) {
      // Personal
      try {
        const { data: personalData, error: personalError } = await supabase
          .from("personal")
          .select("id,nombre,apellido,email,org_id")
          .eq("org_id", requested_org_id)
          .eq("is_deleted", false)
          .eq("vigente", true)
          .order("apellido", { ascending: true })
          .order("nombre", { ascending: true });
        if (!personalError && Array.isArray(personalData)) {
          personal = personalData;
        } else {
          personal = [];
        }
      } catch { personal = []; }

      // Geofences
      try {
        let geofencesArr = [];
        let hasIsDeleted = false;
        try {
          const { data: meta, error: metaError } = await supabase.from("geofences").select("is_deleted").limit(1);
          if (!metaError && Array.isArray(meta) && meta.length > 0 && Object.prototype.hasOwnProperty.call(meta[0], "is_deleted")) {
            hasIsDeleted = true;
          }
        } catch {}
        let geofencesQuery = supabase.from("geofences").select("id,name").eq("org_id", requested_org_id).eq("active", true);
        if (hasIsDeleted) geofencesQuery = geofencesQuery.eq("is_deleted", false);
        const { data: geofencesData, error: geofencesError } = await geofencesQuery.order("name", { ascending: true });
        if (!geofencesError && Array.isArray(geofencesData)) {
          geofencesArr = geofencesData.map(g => ({ id: g.id, name: g.name || null }));
        } else {
          geofencesArr = [];
        }
        geofences = geofencesArr;
      } catch { geofences = []; }

      // Activities
      try {
        const { data: activitiesData, error: activitiesError } = await supabase
          .from("activities")
          .select("id,name")
          .eq("org_id", requested_org_id)
          .order("name", { ascending: true });
        if (!activitiesError && Array.isArray(activitiesData)) {
          activities = activitiesData;
        } else {
          activities = [];
        }
      } catch { activities = []; }

      // Asignaciones
      try {
        const { data: asignacionesData, error: asignacionesError } = await supabase
          .from("asignaciones")
          .select("*")
          .eq("org_id", requested_org_id)
          .or("is_deleted.is.false,is_deleted.is.null")
          .order("created_at", { ascending: false });
        if (!asignacionesError && Array.isArray(asignacionesData)) {
          asignaciones = asignacionesData;
        } else {
          asignaciones = [];
        }
      } catch { asignaciones = []; }
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
    });
  } catch (error) {
    console.error(error?.message);
    if (error?.stack) console.error(error.stack);
    return send(res, 500, { ok: false, error: error?.message || "Internal Server Error" });
  }
}