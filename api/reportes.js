// api/reportes.js
import { resolveOrgAndMembership } from "../src/server/lib/resolveOrg.js";

const VERSION = "reportes-api-v24-canonical-supabase-from";

function setCors(req, res) {
  const origin = req.headers.origin || "*";
  // Alineado con patrón que ya usas en otros endpoints:
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
  // Esperamos YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function err(res, status, error, details) {
  res.status(status).json({ ok: false, error, details, version: VERSION });
}

export default async function handler(req, res) {
  try {
    setCors(req, res);

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    if (req.method !== "GET") {
      return err(res, 405, "Method not allowed", { method: req.method });
    }

    // 🔒 Canon: resolver tenant + membership server-side
    const ctx = await resolveOrgAndMembership(req, res);
    if (!ctx?.ok) {
      return res
        .status(ctx?.status || 401)
        .json({ ok: false, error: ctx?.error || "Unauthorized", details: ctx?.details, version: VERSION });
    }

    const { org_id, role, supabase } = ctx;

    // ✅ Guardia universal: asegurar que estamos usando el cliente correcto
    // Si alguien “refactoriza” y pasa supabase.auth.admin aquí, esto lo detecta con mensaje claro.
    if (!supabase || typeof supabase.from !== "function") {
      return err(res, 500, "Server misconfigured", {
        hint: "Expected a Supabase client with .from(). Do NOT use supabase.auth.admin for queries.",
        gotType: typeof supabase,
        hasFrom: !!supabase?.from,
      });
    }

    const action = String(req.query?.action || "").toLowerCase();

    // =========================
    // ACTION: FILTERS
    // =========================
    if (action === "filters") {
      // Nota: NO tocar DB. Solo select con org_id y soft-delete.
      const [geocercasQ, personasQ, activitiesQ, asignacionesQ] = await Promise.all([
        supabase
          .from("geocercas")
          .select("id,nombre,created_at")
          .eq("org_id", org_id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(2000),

        supabase
          .from("personal")
          .select("id,nombre,apellido,email,created_at")
          .eq("org_id", org_id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(2000),

        supabase
          .from("activities")
          .select("id,name,hourly_rate,currency_code,created_at")
          .eq("org_id", org_id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(2000),

        supabase
          .from("asignaciones")
          .select("id,status,estado,created_at")
          .eq("org_id", org_id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(2000),
      ]);

      // Si alguna falla, devolvemos detalle completo sin romper otros módulos
      const errors = [geocercasQ.error, personasQ.error, activitiesQ.error, asignacionesQ.error].filter(Boolean);
      if (errors.length) {
        return err(res, 500, "Failed loading filters", errors.map((e) => ({ message: e.message, details: e.details })));
      }

      return res.status(200).json({
        ok: true,
        data: {
          geocercas: geocercasQ.data || [],
          personas: personasQ.data || [],
          activities: activitiesQ.data || [],
          asignaciones: asignacionesQ.data || [],
        },
        meta: { org_id, role },
        version: VERSION,
      });
    }

    // =========================
    // ACTION: REPORT
    // =========================
    if (action === "report") {
      const start = normalizeDateISO(req.query?.start);
      const end = normalizeDateISO(req.query?.end);

      const geocerca_ids = parseIdsCSV(req.query?.geocerca_ids);
      const personal_ids = parseIdsCSV(req.query?.personal_ids);
      const activity_ids = parseIdsCSV(req.query?.activity_ids);
      const asignacion_ids = parseIdsCSV(req.query?.asignacion_ids);

      const limit = safeInt(req.query?.limit, 500, 1, 2000);
      const offset = safeInt(req.query?.offset, 0, 0, 50000);

      // 👇 View canónica (sin DB changes). Si falla por permisos, lo veremos claro en details.
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
            "If this is permission denied, it's RLS/view grants. But this endpoint is now correct (supabase.from).",
        });
      }

      return res.status(200).json({
        ok: true,
        data: out.data || [],
        meta: { org_id, role, limit, offset },
        version: VERSION,
      });
    }

    // =========================
    // DEFAULT
    // =========================
    return err(res, 400, "Invalid action", {
      allowed: ["filters", "report"],
      got: action || null,
    });
  } catch (e) {
    return err(res, 500, "Server error", {
      message: e?.message || String(e),
      stack: process.env.NODE_ENV === "production" ? undefined : e?.stack,
    });
  }
}
