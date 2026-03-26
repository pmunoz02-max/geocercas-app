// === Helpers faltantes (copiados de asignaciones.js) ===
function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map((s) => s.trim());
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

      if (req.method === "GET") {
        const action = String(q.action || "list").toLowerCase();
        if (action === "list") {
          const onlyActive = q.onlyActive === "true" || q.onlyActive === true;
          let query = sbDb.from("geofences").select("*").eq("org_id", org_id);
          if (onlyActive) query = query.eq("active", true);
          const { data, error } = await query.order("name", { ascending: true });
          if (error) return send(res, 500, { ok: false, error: "Supabase error", details: error.message });
          return ok(res, { ok: true, items: data });
        }
        if (action === "get") {
          const id = String(q.id || "").trim();
          if (!id) return send(res, 400, { ok: false, error: "missing_id" });
          const { data, error } = await sbDb.from("geofences").select("*").eq("id", id).eq("org_id", org_id).maybeSingle();
          if (error) return send(res, 500, { ok: false, error: "Supabase error", details: error.message });
          if (!data?.id) return send(res, 404, { ok: false, error: "not_found" });
          return ok(res, { ok: true, item: data });
        }
        return send(res, 400, { ok: false, error: "invalid_action" });
      }

      if (req.method === "POST") {
        const rawPayload = await readBody(req);
        const action = String(rawPayload?.action || "upsert").toLowerCase();
        const payload = stripServerOwned(rawPayload);

        if (action === "upsert") {
          const explicitOrgId = String(rawPayload?.org_id || rawPayload?.orgId || "").trim();
          if (explicitOrgId && explicitOrgId !== org_id) {
            return send(res, 403, {
              ok: false,
              error: "org_id_mismatch",
              message: "org_id del payload no coincide con la organización activa."
            });
          }
          const clean = pickAllowed(payload);
          const now = new Date().toISOString();
          const normalizedGeojson =
            ensureFeatureCollection(clean.geojson) ||
            ensureFeatureCollection(clean.polygon_geojson) ||
            (clean.lat !== undefined && clean.lng !== undefined ? buildPointFC(clean.lat, clean.lng) : null);
          if (!normalizedGeojson) {
            return send(res, 400, { ok: false, error: "missing_geometry", message: "Falta geojson o lat/lng" });
          }
          const row = {
            ...clean,
            org_id,
            user_id,
            geojson: normalizedGeojson,
            active: clean.active ?? true,
            is_default: clean.is_default ?? false,
            updated_at: now,
            updated_by: user_id
          };
          let data;
          if (!row.id) {
            row.created_at = now;
            row.created_by = user_id;
            const resInsert = await sbDb.from("geofences").insert(row).select("*").single();
            if (resInsert.error) return send(res, 500, { ok: false, error: "Supabase error", details: resInsert.error.message });
            data = resInsert.data;
          } else {
            const { data: existing, error: existingErr } = await sbDb.from("geofences").select("id,org_id").eq("id", row.id).maybeSingle();
            if (existingErr) return send(res, 500, { ok: false, error: "Supabase error", details: existingErr.message });
            if (!existing?.id || String(existing.org_id) !== org_id) {
              return send(res, 403, { ok: false, error: "forbidden", message: "No ownership or not found" });
            }
            const resUpdate = await sbDb.from("geofences").update(row).eq("id", row.id).eq("org_id", org_id).select("*").single();
            if (resUpdate.error) return send(res, 500, { ok: false, error: "Supabase error", details: resUpdate.error.message });
            data = resUpdate.data;
          }
          return ok(res, { ok: true, item: data });
        }

        if (action === "delete") {
          const id = String(payload?.id || "").trim();
          if (!id) return send(res, 400, { ok: false, error: "missing_id" });
          // Ownership check
          const { data: gf, error: gfErr } = await sbDb.from("geofences").select("id,org_id").eq("id", id).maybeSingle();
          if (gfErr) return send(res, 500, { ok: false, error: "Supabase error", details: gfErr.message });
          if (!gf?.id || String(gf.org_id) !== org_id) {
            return send(res, 403, { ok: false, error: "forbidden", message: "No ownership or not found" });
          }
          // Check references
          const refTables = [
            "asignaciones",
            "tracker_assignments",
            "attendance_events",
            "geofence_events",
            "geofence_members",
            "position_events",
            "user_geofence_state"
          ];
          let hasReferences = false;
          for (const table of refTables) {
            const { count, error } = await sbDb.from(table).select("*", { count: "exact", head: true }).eq("geofence_id", id);
            if (error) {
              console.error("[api/geofences delete] refs error", { table, message: error?.message, code: error?.code, details: error?.details, hint: error?.hint });
              return send(res, 500, { ok: false, error: `Supabase error in ${table}`, details: error.message });
            }
            if (Number(count || 0) > 0) {
              hasReferences = true;
              break;
            }
          }
          const now = new Date().toISOString();
          if (hasReferences) {
            await sbDb.from("geofences").update({ active: false, updated_at: now }).eq("id", id).eq("org_id", org_id);
            return ok(res, { ok: true, mode: "deactivated", reason: "has_references" });
          }
          // Try physical delete
          try {
            await sbDb.from("geofences").delete().eq("id", id).eq("org_id", org_id);
            return ok(res, { ok: true, mode: "deleted" });
          } catch (error) {
            if (error?.code && String(error.code).toLowerCase().includes("foreign")) {
              await sbDb.from("geofences").update({ active: false, updated_at: now }).eq("id", id).eq("org_id", org_id);
              return ok(res, { ok: true, mode: "deactivated", reason: "fk_blocked" });
            }
            throw error;
          }
        }
        return send(res, 400, { ok: false, error: "invalid_action" });
      }

      return send(res, 405, { ok: false, error: "Method not allowed", method: req.method });
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
    const body = await readBody(req);
    // Para DELETE, org_id es obligatorio y se valida estrictamente
    if (req.method === "POST" && String(body?.action || "upsert").toLowerCase() === "delete") {
      const orgId = String(body?.org_id || body?.orgId || q?.org_id || q?.orgId || "").trim();
      const id = body?.id ? String(body.id) : null;
      if (!orgId) return send(res, 400, { ok: false, error: "missing_org_id" });
      if (!id) return send(res, 400, { ok: false, error: "missing_id" });
      console.log("[api/geofences delete] start", { id, orgId, method: req.method });

      // Validar ownership seguro por org_id
      const { data: gf, error: gfErr } = await sbDb.from("geofences").select("id,org_id").eq("id", id).maybeSingle();
      if (gfErr) return send(res, 500, { ok: false, error: "Supabase error", details: gfErr.message });
      if (!gf?.id || String(gf.org_id) !== String(orgId)) {
        return send(res, 403, { ok: false, error: "forbidden", message: "No ownership or not found" });
      }

      // Revisar referencias en tablas relevantes (universal, sin asumir columna id)
      const refTables = [
        "asignaciones",
        "tracker_assignments",
        "attendance_events",
        "geofence_events",
        "geofence_members",
        "position_events",
        "user_geofence_state"
      ];
      let hasReferences = false;
      for (const table of refTables) {
        let refResult;
        try {
          const { count, error } = await sbDb
            .from(table)
            .select("*", { count: "exact", head: true })
            .eq("geofence_id", id);
          if (error) {
            console.error("[api/geofences delete] refs error", {
              table,
              message: error?.message,
              code: error?.code,
              details: error?.details,
              hint: error?.hint
            });
            // Retornar error estructurado como pide el usuario
            return send(res, 500, { ok: false, error: `Supabase error in ${table}`, details: error?.message });
          }
          refResult = { table, hasRefs: Number(count || 0) > 0 };
        } catch (error) {
          console.error("[api/geofences delete] refs error", {
            table,
            message: error?.message,
            code: error?.code,
            details: error?.details,
            hint: error?.hint
          });
          // Retornar error estructurado como pide el usuario
          return send(res, 500, { ok: false, error: `Supabase error in ${table}`, details: error?.message });
        // (Eliminado bloque try anidado y líneas sobrantes)

          const q = getQuery(req);
          const requestedOrgId = q.org_id || q.orgId || null;
          const ctxRes = await resolveContext(req, { requestedOrgId });
          if (!ctxRes.ok) return send(res, ctxRes.status, { ok: false, error: ctxRes.error, details: ctxRes.details });
          const sbDb = ctxRes.sbDb;
          const ctx = ctxRes.ctx;
          const user = ctxRes.user;
          const body = await readBody(req);

          // DELETE: no tocar (mantener branch previo)
          if (req.method === "POST" && String(body?.action || "upsert").toLowerCase() === "delete") {
            // ...existing code for delete (no changes)...
            // ...existing code for delete (no changes)...
            // ...existing code for delete (no changes)...
          }

          // UPSERT: implementación completa
          if (req.method === "POST" && String(body?.action || "upsert").toLowerCase() === "upsert") {
            const payload = body;
            const explicitOrgId = String(payload?.org_id || payload?.orgId || "").trim();
            if (explicitOrgId && explicitOrgId !== String(ctx.org_id)) {
              return send(res, 403, {
                ok: false,
                error: "org_id_mismatch",
                message: "org_id del payload no coincide con la organización activa."
              });
            }
            const org_id = String(ctx.org_id);
            const user_id = String(user.id);
            const clean = pickAllowed(payload);

            // Geometría mínima
            let normalizedGeojson = null;
            if (clean.geojson) {
              normalizedGeojson = ensureFeatureCollection(clean.geojson);
            } else if (clean.lat !== undefined && clean.lng !== undefined) {
              normalizedGeojson = buildPointFC(clean.lat, clean.lng);
            }
            if (!normalizedGeojson) {
              return send(res, 400, { ok: false, error: "missing_geometry", message: "Falta geojson o lat/lng" });
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
              updated_by: user_id
            };

            let savedRow = null;
            if (!row.id) {
              // Insertar nueva geocerca
              row.created_at = now;
              row.created_by = user_id;
              const { data, error } = await sbDb.from("geofences").insert(row).select("*").single();
              if (error) {
                return send(res, 500, { ok: false, error: "Supabase error", details: error.message });
              }
              savedRow = data;
            } else {
              // Update: verificar ownership
              const { data: existing, error: existingErr } = await sbDb.from("geofences").select("id,org_id").eq("id", row.id).maybeSingle();
              if (existingErr) {
                return send(res, 500, { ok: false, error: "Supabase error", details: existingErr.message });
              }
              if (!existing?.id || String(existing.org_id) !== org_id) {
                return send(res, 403, { ok: false, error: "forbidden", message: "No ownership or not found" });
              }
              const { data, error } = await sbDb.from("geofences").update(row).eq("id", row.id).eq("org_id", org_id).select("*").single();
              if (error) {
                return send(res, 500, { ok: false, error: "Supabase error", details: error.message });
              }
              savedRow = data;
            }
            return ok(res, { ok: true, item: savedRow });
          }
          // Fin de bloque POST upsert
        }
        // Fin de handler
      }
