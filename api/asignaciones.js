import { createClient } from "@supabase/supabase-js";

const VERSION = "asignaciones-api-v14-stable-preview";

/* =========================
   Headers / Cookies / Query
========================= */

function setHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("Vary", "Cookie, Authorization");

  res.setHeader("X-Api-Version", VERSION);
  res.setHeader("Access-Control-Allow-Origin", "*");
  // api/asignaciones.js — estructura estable tipo geofences
  // Helpers locales
  function send(res, status, payload) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
  }

  function ok(res, payload) {
    send(res, 200, { ok: true, ...payload });
  }

  async function resolveContext(req) {
    // Simulación mínima para estructura base
    return { ok: true, orgId: "dummy-org" };
  }

  // Handler principal
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function send(res, status, obj) {
  setHeaders(res);
  res.statusCode = status;
  res.end(JSON.stringify({ ...(obj || {}), version: VERSION }));
}

function ok(res, obj) {
  return send(res, 200, obj);
}

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  export default async function handler(req, res) {
    res.status(200).json({
      ok: true,
      route: 'asignaciones-minimal',
      method: req.method,
      org_id: req.query?.org_id || null
    });
  }

        let catalogs = { geocercas: [], activities: [], personal: [] };
        try {
          catalogs = await loadCatalogs(sbDb, orgId);
        } catch (e) {
          console.error("[api/asignaciones] error loadCatalogs", {
            message: e?.message,
            details: e?.details,
            hint: e?.hint,
            code: e?.code,
            orgId,
          });
        }

        // Refuerza que catalogs.personal siempre se cargue correctamente antes de responder
        try {
          let r = await sbDb
            let etapa = "inicio-handler";
            try {
              etapa = "listAssignmentsCanonical";
              const merged = await listAssignmentsCanonical(sbDb, orgId);
              etapa = "loadCatalogs";
              let catalogs = { geocercas: [], activities: [], personal: [] };
              try {
                catalogs = await loadCatalogs(sbDb, orgId);
              } catch (e) {
                etapa = "error-loadCatalogs";
                console.error("[api/asignaciones] error loadCatalogs", {
                  message: e?.message,
                  details: e?.details,
                  hint: e?.hint,
                  code: e?.code,
                  orgId,
                });
              }
              etapa = "pre-respuesta";
              const requestedOrgId = (typeof searchParams !== "undefined" && searchParams.get) ? searchParams.get("org_id") || null : (typeof orgId !== "undefined" ? orgId : null);
              // DEBUG TEMPORAL antes de responder
              console.log("[DEBUG/ASIGNACIONES] org_id:", requestedOrgId);
              console.log("[DEBUG/ASIGNACIONES] tablas consultadas: personal, org_people");
              console.log("[DEBUG/ASIGNACIONES] cantidad personal devuelto:", Array.isArray(catalogs.personal) ? catalogs.personal.length : -1);
              etapa = "respuesta-ok";
              return ok(res, {
                ok: true,
                data: {
                  asignaciones: merged,
                  catalogs,
                  debug: {
                    org_id: requestedOrgId,
                    personal_count: Array.isArray(catalogs.personal) ? catalogs.personal.length : -1,
                    geocercas_count: Array.isArray(catalogs.geocercas) ? catalogs.geocercas.length : -1,
                    activities_count: Array.isArray(catalogs.activities) ? catalogs.activities.length : -1
                  }
                },
              });
            } catch (error) {
              console.error("[api/asignaciones] GET error", {
                    return res.status(200).json({
                      ok: true,
                      route: 'asignaciones-diagnostic-01',
                      query: req.query || null,
                      method: req.method
                    });
          ok: false,
          error: "invalid_geofence_or_geocerca",
          details: String(e?.message || e),
        });
      }

      const row = {
        ...body,
        org_id: orgId,
        personal_id: personalId,
        start_date: body?.start_date ? startDate : undefined,
        end_date: body?.end_date ? endDate : undefined,
        geocerca_id,
      };

      delete row.is_deleted;
      delete row.replaceExisting;
      stripUndefined(row);

      let existingRows = [];
      try {
        existingRows = await listExistingAssignmentsForConflict(sbDb, orgId, personalId);
      } catch (e) {
        return send(res, 500, {
          ok: false,
          error: "supabase_error",
          details: String(e?.message || e),
        });
      }

      const activeRows = existingRows.filter((r) => {
        if (!r || r.is_deleted === true) return false;

        const hasEstadoVal =
          r.estado !== undefined && r.estado !== null && String(r.estado).trim() !== "";
        const hasStatusVal =
          r.status !== undefined && r.status !== null && String(r.status).trim() !== "";

        if (!hasEstadoVal && !hasStatusVal) return true;

        return (
          String(r.estado || "").toLowerCase() === "activa" ||
          String(r.status || "").toLowerCase() === "activa"
        );
      });

      const conflicts = activeRows
        .filter((r) =>
          rangesOverlap(
            startDate,
            endDate,
            toYmd(r.start_date || r.start_time),
            toYmd(r.end_date || r.end_time)
          )
        )
        .map((r) => ({
          id: r.id,
          start_date: toYmd(r.start_date || r.start_time),
          end_date: toYmd(r.end_date || r.end_time),
          geofence_id: r.geofence_id || null,
          geocerca_id: r.geocerca_id || null,
        }));

      if (conflicts.length > 0 && !replaceExisting) {
        return send(res, 409, {
          ok: false,
          error: "assignment_conflict",
          message:
            "Ya existe una asignación activa o superpuesta para esta persona. Cierra o reemplaza la asignación actual antes de crear una nueva.",
          conflicts,
        });
      }

      if (conflicts.length > 0 && replaceExisting) {
        if (!startDate) {
          return send(res, 400, {
            ok: false,
            error: "replace_requires_start_date",
            message: "replaceExisting=true requiere start_date para cerrar asignaciones previas.",
            conflicts,
          });
        }

        const closeDate = dayBeforeYmd(startDate);

        for (const c of conflicts) {
          const closeRes = await sbDb
            .from("asignaciones")
            .update({ end_date: closeDate })
            .eq("id", c.id)
            .eq("org_id", orgId)
            .eq("personal_id", personalId);

          if (closeRes.error) {
            return send(res, 500, {
              ok: false,
              error: "supabase_error",
              details: closeRes.error.message,
            });
          }
        }
      }

      const r = await sbDb.from("asignaciones").insert(row).select("*").single();

      if (r.error) {
        if (isExclusionConstraintError(r.error)) {
          return send(res, 409, {
            ok: false,
            error: "assignment_conflict",
            message:
              "Ya existe una asignación activa o superpuesta para esta persona. Cierra o reemplaza la asignación actual antes de crear una nueva.",
            conflicts,
          });
        }

        return send(res, 500, {
          ok: false,
          error: "supabase_error",
          details: r.error.message,
        });
      }

      await syncTrackerAssignmentFromAsignacion({
        sbDb,
        orgId,
        asignacion: r.data,
        action: "create",
      });

      if (userId) {
        await insertMetricsEventSilent(sbDb, {
          org_id: orgId,
          user_id: userId,
          event_type: "assignment_created",
          meta: {},
        });
      }

      return ok(res, { ok: true, data: r.data });
    }

    if (req.method === "PATCH") {
      const body = await readBody(req);
      const id = String(body?.id || "");
      const patch0 = body?.patch && typeof body.patch === "object" ? body.patch : body;

      if (!id) {
        return send(res, 400, { ok: false, error: "id_is_required" });
      }

      const patch = { ...(patch0 || {}) };
      delete patch.id;
      delete patch.patch;

      if (patch.geofence_id || patch.geocerca_id || patch.geofenceId || patch.geocercaId) {
        try {
          patch.geocerca_id = await resolveLegacyGeocercaId(sbDb, orgId, patch);
        } catch (e) {
          return send(res, 400, {
            ok: false,
            error: "invalid_geofence_or_geocerca",
            details: String(e?.message || e),
          });
        }
      }

      patch.org_id = orgId;
      delete patch.is_deleted;
      stripUndefined(patch);

      let shouldTrackCompleted = false;
      const nextStatusFromPatch = normalizeAssignmentStatus(patch.status || patch.estado);

      if (nextStatusFromPatch) {
        try {
          const beforeRes = await sbDb
            .from("asignaciones")
            .select("id,status,estado")
            .eq("id", id)
            .eq("org_id", orgId)
            .maybeSingle();

          const beforeStatus = normalizeAssignmentStatus(
            beforeRes?.data?.status || beforeRes?.data?.estado
          );

          shouldTrackCompleted =
            isCompletedAssignmentStatus(nextStatusFromPatch) &&
            !isCompletedAssignmentStatus(beforeStatus);
        } catch (_) {
          // ignore
        }
      }

      const r = await sbDb
        .from("asignaciones")
        .update(patch)
        .eq("id", id)
        .eq("org_id", orgId)
        .select("*")
        .single();

      if (r.error) {
        return send(res, 500, {
          ok: false,
          error: "supabase_error",
          details: r.error.message,
        });
      }

      await syncTrackerAssignmentFromAsignacion({
        sbDb,
        orgId,
        asignacion: r.data,
        action: "update",
      });

      if (shouldTrackCompleted && userId) {
        await insertMetricsEventSilent(sbDb, {
          org_id: orgId,
          user_id: userId,
          event_type: "assignment_completed",
          meta: {},
        });
      }

      return ok(res, { ok: true, data: r.data });
    }

    if (req.method === "DELETE") {
      const body = await readBody(req);
      const id = String(body?.id || "");

      if (!id) {
        return send(res, 400, { ok: false, error: "id_is_required" });
      }

      const prev = await sbDb
        .from("asignaciones")
        .select("*")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();

      const r = await sbDb
        .from("asignaciones")
        .update({ is_deleted: true })
        .eq("id", id)
        .eq("org_id", orgId)
        .select("*")
        .single();

      if (r.error) {
        return send(res, 500, {
          ok: false,
          error: "supabase_error",
          details: r.error.message,
        });
      }

      await syncTrackerAssignmentFromAsignacion({
        sbDb,
        orgId,
        asignacion: prev.data,
        action: "delete",
      });

      return ok(res, { ok: true, data: r.data });
    }

    return send(res, 405, {
      ok: false,
      error: "method_not_allowed",
      method: req.method,
    });
  } catch (e) {
    console.error("[api/asignaciones] fatal", e);
    return send(res, 500, {
      ok: false,
      error: "server_error",
      details: String(e?.message || e),
    });
  }
}