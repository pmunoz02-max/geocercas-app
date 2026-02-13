// api/geocercas.js
import { createClient } from "@supabase/supabase-js";

const VERSION = "geocercas-api-v9-ctx-org-server-owned";

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

/* =========================
   Context Resolver (CANÓNICO)
========================= */

async function resolveContext(req) {
  const SUPABASE_URL = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
  const SUPABASE_ANON_KEY = getEnv([
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]);
  const SUPABASE_SERVICE_ROLE_KEY = getEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"]);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
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

  let ctx = null;
  try {
    const { data, error } = await sbUser.rpc("bootstrap_user_context");
    if (!error) ctx = Array.isArray(data) ? data[0] || null : data;
  } catch {}

  if (!ctx?.org_id || !ctx?.role) {
    return {
      ok: false,
      status: 403,
      error: "Missing org/role context",
      details: "bootstrap_user_context did not return org_id/role",
    };
  }

  const sbSrv = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return { ok: true, user, ctx, sbSrv };
}

/* =========================
   Sanitizers (server-owned)
========================= */

function stripServerOwned(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const out = { ...p };

  // server-owned / generated / audit
  delete out.nombre_ci; // GENERATED ALWAYS lower(nombre)
  delete out.created_at;
  delete out.updated_at;
  delete out.deleted_at;
  delete out.revoked_at;
  delete out.created_by;
  delete out.updated_by;

  // multi-tenant / ownership (siempre desde ctx)
  delete out.org_id;
  delete out.tenant_id;
  delete out.user_id;
  delete out.owner_id;
  delete out.usuario_id;

  return out;
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

    const ctxRes = await resolveContext(req);
    if (!ctxRes.ok) {
      return send(res, ctxRes.status, { ok: false, error: ctxRes.error, details: ctxRes.details });
    }

    const { ctx, sbSrv } = ctxRes;

    const org_id = String(ctx.org_id);
    const tenant_id = String(ctx.tenant_id || ctx.org_id);

    // GET
    if (req.method === "GET") {
      const q = getQuery(req);
      const action = String(q.action || "list");

      if (action === "list") {
        const onlyActive = normalizeBoolFlag(q.onlyActive, true);
        const limit = Math.min(Number(q.limit || 2000), 2000);

        let query = sbSrv
          .from("geocercas")
          .select("id,nombre,name,nombre_ci,org_id,tenant_id,activo,updated_at")
          .eq("org_id", org_id)
          .order("nombre", { ascending: true })
          .limit(limit);

        if (onlyActive) query = query.eq("activo", true);

        const { data, error } = await query;
        if (error) {
          return ok(res, { ok: false, items: [], error: "Supabase error", details: error.message });
        }

        return ok(res, { ok: true, items: Array.isArray(data) ? data : [] });
      }

      if (action === "get") {
        const id = q.id ? String(q.id) : null;
        if (!id) return send(res, 400, { ok: false, error: "id is required" });

        const { data, error } = await sbSrv
          .from("geocercas")
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
      const action = String(payload?.action || "upsert").toLowerCase();

      if (!requireWriteRole(ctx.role)) {
        return send(res, 403, { ok: false, error: "Forbidden", details: "Requires owner/admin" });
      }

      if (action === "upsert") {
        const nombreIn = String(payload?.nombre || "").trim();
        const nameIn = String(payload?.name || "").trim();
        const finalName = nombreIn || nameIn;

        if (!finalName) {
          return send(res, 400, { ok: false, error: "nombre (or name) is required" });
        }

        // ✅ Reactivación permanente:
        // si existía la fila y estaba activo=false por delete soft,
        // al guardar de nuevo debe volver a activo=true.
        const finalActivo =
          payload?.activo !== undefined
            ? Boolean(payload.activo)
            : payload?.active !== undefined
            ? Boolean(payload.active)
            : payload?.activa !== undefined
            ? Boolean(payload.activa)
            : true; // 🔥 default: true

        const row = {
          id: payload?.id || undefined,
          org_id,
          tenant_id,
          nombre: finalName,
          name: finalName,
          descripcion: payload?.descripcion ?? undefined,
          geojson: payload?.geojson ?? undefined,
          geometry: payload?.geometry ?? undefined,
          polygon: payload?.polygon ?? undefined,
          geom: payload?.geom ?? undefined,
          lat: payload?.lat ?? undefined,
          lng: payload?.lng ?? undefined,
          radius_m: payload?.radius_m ?? undefined,
          visible: payload?.visible ?? undefined,
          bbox: payload?.bbox ?? undefined,
          personal_ids: payload?.personal_ids ?? undefined,
          asignacion_ids: payload?.asignacion_ids ?? undefined,
          activo: finalActivo,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await sbSrv
          .from("geocercas")
          .upsert(row, { onConflict: "org_id,nombre_ci" })
          .select("*")
          .maybeSingle();

        if (error) return send(res, 500, { ok: false, error: "Supabase error", details: error.message });

        return ok(res, { ok: true, item: data || null });
      }

      if (action === "delete") {
        const id = payload?.id ? String(payload.id) : null;

        const nombres_ci = Array.isArray(payload?.nombres_ci)
          ? payload.nombres_ci.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)
          : [];

        const nombre_ci_single = payload?.nombre_ci ? String(payload.nombre_ci).trim().toLowerCase() : null;

        if (!id && !nombres_ci.length && !nombre_ci_single) {
          return ok(res, { ok: true, deleted: 0, skipped: true, reason: "delete called without targets" });
        }

        let q = sbSrv
          .from("geocercas")
          .update({ activo: false, updated_at: new Date().toISOString() })
          .eq("org_id", org_id)
          .select("id,nombre,name,nombre_ci,org_id,tenant_id,activo,updated_at");

        if (id) q = q.eq("id", id);
        else if (nombres_ci.length) q = q.in("nombre_ci", nombres_ci);
        else if (nombre_ci_single) q = q.eq("nombre_ci", nombre_ci_single);

        const { data, error } = await q;
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
