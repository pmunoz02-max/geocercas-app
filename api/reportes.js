// api/reportes.js
import { resolveOrgAndMembership } from "../src/server/lib/resolveOrg.js";

const VERSION = "reportes-api-v25-robust-softdelete-schema";

function setCors(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
}

function parseIdsCSV(v) {
  if (!v) return [];
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function safeInt(v, def, min, max) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return def;
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}

function normalizeDateISO(d) {
  if (!d) return null;
  const s = String(d).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function err(res, status, error, details) {
  res.status(status).json({ ok: false, error, details, version: VERSION });
}

// Detecta errores típicos de “columna no existe”
function isMissingColumnError(e) {
  const msg = e?.message || "";
  return /column .* does not exist/i.test(msg);
}

/**
 * Ejecuta un SELECT y, si falla por columna inexistente (soft-delete),
 * reintenta sin filtros de soft-delete.
 *
 * Esto permite que el endpoint funcione en DBs con y sin deleted_at,
 * sin tocar el esquema.
 */
async function selectWithSoftDeleteFallback({ supabase, table, select, org_id, softDeleteCandidates = [] }) {
  // softDeleteCandidates = ["deleted_at", "is_deleted", "deleted", "active"]
  // estrategia:
  // - si existe deleted_at (o similar), aplicamos filtro “no borrado”
  // - si no existe, reintentamos sin ese filtro
  // Nota: no podemos detectar columnas sin DB, así que hacemos try/catch.

  // 1) Intento con primer candidato (si existe lista)
  const attempts = [];

  // Construye query base
  const base = () => supabase.from(table).select(select).eq("org_id", org_id);

  // Genera variantes a intentar
  if (softDeleteCandidates.length) {
    for (const col of softDeleteCandidates) {
      // Reglas comunes:
      // - deleted_at: is null
      // - is_deleted/deleted: eq false
      // - active: eq true
      attempts.push({ col, q: (q) => applySoftDeleteFilter(q, col) });
    }
  }

  // Siempre último intento sin filtro
  attempts.push({ col: null, q: (q) => q });

  let lastErr = null;

  for (const a of attempts) {
    try {
      let q = base();
      q = a.q(q);
      const out = await q.order("created_at", { ascending: false }).limit(2000);

      if (out.error) {
        // Si es por columna inexistente y estábamos usando filtro, reintentar
        if (a.col && isMissingColumnError(out.error)) {
          lastErr = out.error;
          continue;
        }
        // Si no es missing column, error real: abortar
        return { data: null, error: out.error, usedSoftDelete: a.col };
      }

      return { data: out.data || [], error: null, usedSoftDelete: a.col };
    } catch (e) {
      // fetch/runtime
      lastErr = e;
      if (a.col && isMissingColumnError(e)) continue;
      return { data: null, error: e, usedSoftDelete: a.col };
    }
  }

  return { data: null, error: lastErr || new Error("Unknown error"), usedSoftDelete: null };
}

function applySoftDeleteFilter(q, col) {
  if (!col) return q;
  const c = String(col);

  if (c === "deleted_at") return q.is("deleted_at", null);
  if (c === "is_deleted") return q.eq("is_deleted", false);
  if (c === "deleted") return q.eq("deleted", false);
  if (c === "active") return q.eq("active", true);

  // Default conservador: tratar como deleted_at
  return q.is(c, null);
}

export default async function handler(req, res) {
  try {
    setCors(req, res);

    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return err(res, 405, "Method not allowed", { method: req.method });

    const ctx = await resolveOrgAndMembership(req, res);
    if (!ctx?.ok) {
      return res
        .status(ctx?.status || 401)
        .json({ ok: false, error: ctx?.error || "Unauthorized", details: ctx?.details, version: VERSION });
    }

    const { org_id, role, supabase } = ctx;

    if (!supabase || typeof supabase.from !== "function") {
      return err(res, 500, "Server misconfigured", {
        hint: "Expected a Supabase client with .from().",
        hasFrom: !!supabase?.from,
      });
    }

    const action = String(req.query?.action || "").toLowerCase();

    // ========= FILTERS =========
    if (action === "filters") {
      // Candidatos universales de soft-delete (sin asumir esquema)
      const softDelete = ["deleted_at", "is_deleted", "deleted", "active"];

      const [geoc, pers, act, asig] = await Promise.all([
        selectWithSoftDeleteFallback({
          supabase,
          table: "geocercas",
          select: "id,nombre,created_at",
          org_id,
          softDeleteCandidates: softDelete,
        }),
        selectWithSoftDeleteFallback({
          supabase,
          table: "personal",
          select: "id,nombre,apellido,email,created_at",
          org_id,
          softDeleteCandidates: softDelete,
        }),
        selectWithSoftDeleteFallback({
          supabase,
          table: "activities",
          select: "id,name,hourly_rate,currency_code,created_at",
          org_id,
          softDeleteCandidates: softDelete,
        }),
        selectWithSoftDeleteFallback({
          supabase,
          table: "asignaciones",
          select: "id,status,estado,created_at",
          org_id,
          softDeleteCandidates: softDelete,
        }),
      ]);

      const errors = [
        geoc.error && { scope: "geocercas", message: geoc.error.message, details: geoc.error.details },
        pers.error && { scope: "personal", message: pers.error.message, details: pers.error.details },
        act.error && { scope: "activities", message: act.error.message, details: act.error.details },
        asig.error && { scope: "asignaciones", message: asig.error.message, details: asig.error.details },
      ].filter(Boolean);

      if (errors.length) {
        return err(res, 500, "Failed loading filters", {
          errors,
          hint: "One or more filter queries failed. This endpoint auto-falls back when soft-delete columns don't exist.",
        });
      }

      return res.status(200).json({
        ok: true,
        data: {
          geocercas: geoc.data,
          personas: pers.data,
          activities: act.data,
          asignaciones: asig.data,
        },
        meta: {
          org_id,
          role,
          softDeleteApplied: {
            geocercas: geoc.usedSoftDelete,
            personal: pers.usedSoftDelete,
            activities: act.usedSoftDelete,
            asignaciones: asig.usedSoftDelete,
          },
        },
        version: VERSION,
      });
    }

    // ========= REPORT =========
    if (action === "report") {
      const start = normalizeDateISO(req.query?.start);
      const end = normalizeDateISO(req.query?.end);

      const geocerca_ids = parseIdsCSV(req.query?.geocerca_ids);
      const personal_ids = parseIdsCSV(req.query?.personal_ids);
      const activity_ids = parseIdsCSV(req.query?.activity_ids);
      const asignacion_ids = parseIdsCSV(req.query?.asignacion_ids);

      const limit = safeInt(req.query?.limit, 500, 1, 2000);
      const offset = safeInt(req.query?.offset, 0, 0, 50000);

      let q = supabase
        .from("v_reportes_diario_con_asignacion")
        .select("*")
        .eq("org_id", org_id)
        .order("work_day", { ascending: false })
        .range(offset, offset + limit - 1);

      if (start) q = q.gte("work_day", start);
      if (end) q = q.lte("work_day", end);

      if (geocerca_ids.length) q = q.in("geocerca_id", geocerca_ids);
      if (personal_ids.length) q = q.in("personal_id", personal_ids);
      if (activity_ids.length) q = q.in("activity_id", activity_ids);
      if (asignacion_ids.length) q = q.in("asignacion_id", asignacion_ids);

      const out = await q;

      if (out.error) {
        return err(res, 500, "Failed generating report", {
          message: out.error.message,
          details: out.error.details,
          hint:
            "If permission denied, it's RLS/view grants. If column missing, schema mismatch in the view. No DB changes in this fix.",
        });
      }

      return res.status(200).json({
        ok: true,
        data: out.data || [],
        meta: { org_id, role, limit, offset },
        version: VERSION,
      });
    }

    return err(res, 400, "Invalid action", { allowed: ["filters", "report"], got: action || null });
  } catch (e) {
    return err(res, 500, "Server error", { message: e?.message || String(e) });
  }
}
