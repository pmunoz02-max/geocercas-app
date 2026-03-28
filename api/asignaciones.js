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
      const { id, ...fields } = req.body || {};
      if (!id) return send(res, 400, { ok: false, error: "missing_id" });
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