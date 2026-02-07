// api/personal.js
import { resolveOrgAndMembership } from "../src/server/lib/resolveOrg.js";

export const config = { runtime: "nodejs" };

const VERSION = "personal-api-v23-memberships-resolveOrg";

/* =========================
   Response helpers
========================= */
function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Api-Version", VERSION);
  res.end(JSON.stringify({ ...payload, version: VERSION }));
}

function requireWriteRole(role) {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin" || r === "root" || r === "root_owner";
}

async function readBody(req) {
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
   Sort helper (server-side)
========================= */
function cmpString(a, b) {
  const A = String(a || "").trim().toLowerCase();
  const B = String(b || "").trim().toLowerCase();
  return A.localeCompare(B);
}

/**
 * Ranking:
 * 0 = vigente (vigente=true AND not deleted)
 * 1 = no vigente (vigente=false AND not deleted)
 * 2 = eliminado (is_deleted=true OR deleted_at not null)
 */
function rankPerson(p) {
  const deleted = !!p?.is_deleted || !!p?.deleted_at;
  if (deleted) return 2;
  const vigente = p?.vigente !== false;
  return vigente ? 0 : 1;
}

function sortPersonal(items) {
  const arr = Array.isArray(items) ? [...items] : [];
  arr.sort((a, b) => {
    const ra = rankPerson(a);
    const rb = rankPerson(b);
    if (ra !== rb) return ra - rb;

    const last = cmpString(a?.apellido, b?.apellido);
    if (last !== 0) return last;

    const first = cmpString(a?.nombre, b?.nombre);
    if (first !== 0) return first;

    const email = cmpString(a?.email, b?.email);
    if (email !== 0) return email;

    return cmpString(a?.id, b?.id);
  });
  return arr;
}

/* =========================
   Payload allowlist (universal & safe)
   - Mantiene UI estable
   - Evita meter columnas sorpresa
========================= */
function pickUpsertFields(payload) {
  const p = payload && typeof payload === "object" ? payload : {};

  // Campos típicos UI
  const out = {};

  // Strings
  for (const k of [
    "nombre",
    "apellido",
    "email",
    "telefono",
    "documento",
    "cargo",
    "notas",
    "observaciones",
  ]) {
    if (p[k] !== undefined) out[k] = p[k] === null ? null : String(p[k]);
  }

  // Boolean
  if (p.vigente !== undefined) out.vigente = !!p.vigente;

  // Si tu UI manda "is_deleted" por error, lo ignoramos (soft-delete solo server)
  // Si tu UI manda org_id, lo ignoramos SIEMPRE

  return out;
}

function normalizeEmail(email) {
  const s = String(email || "").trim().toLowerCase();
  return s || "";
}

/* =========================
   GET (list)
========================= */
async function handleList(req, res) {
  const ctx = await resolveOrgAndMembership(req, res);

  // Compat: si helper ya responde con status/error, respetamos
  if (!ctx?.ok && ctx?.status) {
    return json(res, ctx.status, { error: ctx.error || "Unauthorized", details: ctx.details });
  }

  const org_id = ctx.org_id;
  const role = ctx.role;
  const supabase = ctx.supabase;
  const user_id = ctx.user_id || ctx.user?.id;

  if (!org_id || !supabase || !user_id) {
    return json(res, 500, { error: "Contexto incompleto", details: "resolveOrgAndMembership no devolvió org_id/supabase/user_id" });
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const q = (url.searchParams.get("q") || "").trim();
  const onlyActive = (url.searchParams.get("onlyActive") || "1") !== "0"; // default true
  const limit = Math.min(Number(url.searchParams.get("limit") || 500), 2000);
  const debug = url.searchParams.get("debug") === "1";

  let query = supabase
    .from("personal")
    .select("*")
    .eq("org_id", org_id)
    .limit(limit);

  // onlyActive=1 => vigentes y NO eliminados
  if (onlyActive) {
    query = query.eq("is_deleted", false).eq("vigente", true);
  }

  // búsqueda
  if (q) {
    const pattern = `%${q}%`;
    query = query.or(
      [
        `nombre.ilike.${pattern}`,
        `apellido.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `telefono.ilike.${pattern}`,
        `documento.ilike.${pattern}`,
      ].join(",")
    );
  }

  const { data, error } = await query;
  if (error) return json(res, 500, { error: "No se pudo listar personal", details: error.message });

  const ordered = sortPersonal(data || []);

  return json(res, 200, {
    items: ordered,
    ...(debug
      ? {
          debug: {
            org_id,
            role,
            onlyActive,
            limit,
            returned: ordered.length,
          },
        }
      : {}),
  });
}

/* =========================
   POST (writes direct, no RPCs)
   Actions:
   - upsert (default)
   - toggle (vigente)
   - delete (soft delete)
========================= */
async function handlePost(req, res) {
  const ctx = await resolveOrgAndMembership(req, res);

  if (!ctx?.ok && ctx?.status) {
    return json(res, ctx.status, { error: ctx.error || "Unauthorized", details: ctx.details });
  }

  const org_id = ctx.org_id;
  const role = ctx.role;
  const supabase = ctx.supabase;
  const user_id = ctx.user_id || ctx.user?.id;

  if (!org_id || !supabase || !user_id) {
    return json(res, 500, { error: "Contexto incompleto", details: "resolveOrgAndMembership no devolvió org_id/supabase/user_id" });
  }

  if (!requireWriteRole(role)) {
    return json(res, 403, { error: "Sin permisos", details: "Requiere rol admin u owner" });
  }

  const payload = (await readBody(req)) || {};
  const action = String(payload.action || "").toLowerCase();

  // ===== toggle vigente =====
  if (action === "toggle") {
    const id = payload.id;
    if (!id) return json(res, 400, { error: "Falta id" });

    // Traemos vigente actual (y evitamos togglear si está eliminado)
    const { data: row, error: e1 } = await supabase
      .from("personal")
      .select("id, vigente, is_deleted, deleted_at")
      .eq("org_id", org_id)
      .eq("id", id)
      .maybeSingle();

    if (e1) return json(res, 500, { error: "No se pudo leer registro", details: e1.message });
    if (!row) return json(res, 404, { error: "No encontrado" });

    const deleted = !!row.is_deleted || !!row.deleted_at;
    if (deleted) return json(res, 400, { error: "No se puede togglear un registro eliminado" });

    const nextVigente = row.vigente === false ? true : false;

    const { data, error } = await supabase
      .from("personal")
      .update({
        vigente: nextVigente,
        updated_at: new Date().toISOString(),
        updated_by: user_id,
      })
      .eq("org_id", org_id)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) return json(res, 500, { error: "No se pudo cambiar estado", details: error.message });
    return json(res, 200, { item: data });
  }

  // ===== soft delete =====
  if (action === "delete") {
    const id = payload.id;
    if (!id) return json(res, 400, { error: "Falta id" });

    const { data, error } = await supabase
      .from("personal")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: user_id,
        updated_at: new Date().toISOString(),
        updated_by: user_id,
      })
      .eq("org_id", org_id)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) return json(res, 500, { error: "No se pudo eliminar", details: error.message });
    if (!data) return json(res, 404, { error: "No encontrado" });
    return json(res, 200, { item: data });
  }

  // ===== upsert (default) =====
  const id = payload.id || payload.person_id || payload.personal_id || null;

  const upsertFields = pickUpsertFields(payload);

  // Normalización ligera (mantiene UI estable)
  if (upsertFields.email !== undefined) {
    upsertFields.email = normalizeEmail(upsertFields.email);
  }

  // Seguridad universal: org_id siempre server-side
  upsertFields.org_id = org_id;

  // Auditoría (si existen columnas, quedará; si no existen, Supabase devolverá error)
  // Para hacerlo universal, intentamos sin romper: primero probamos incluir audit fields,
  // y si falla por columna inexistente, reintentamos sin ellas.
  const nowIso = new Date().toISOString();

  async function tryInsert(updateOrInsert) {
    // updateOrInsert = "insert" | "update"
    if (updateOrInsert === "insert") {
      return await supabase
        .from("personal")
        .insert({
          ...upsertFields,
          created_at: nowIso,
          created_by: user_id,
          updated_at: nowIso,
          updated_by: user_id,
          is_deleted: false,
        })
        .select("*")
        .maybeSingle();
    }

    return await supabase
      .from("personal")
      .update({
        ...upsertFields,
        updated_at: nowIso,
        updated_by: user_id,
      })
      .eq("org_id", org_id)
      .eq("id", id)
      .select("*")
      .maybeSingle();
  }

  async function tryInsertWithoutAudit(updateOrInsert) {
    if (updateOrInsert === "insert") {
      const minimal = { ...upsertFields };
      // si UI no manda vigente, default true
      if (minimal.vigente === undefined) minimal.vigente = true;
      // si UI no manda is_deleted, default false
      minimal.is_deleted = false;

      return await supabase
        .from("personal")
        .insert(minimal)
        .select("*")
        .maybeSingle();
    }

    return await supabase
      .from("personal")
      .update({ ...upsertFields })
      .eq("org_id", org_id)
      .eq("id", id)
      .select("*")
      .maybeSingle();
  }

  // Si es insert y no manda vigente, default true (mantiene comportamiento común)
  if (!id && upsertFields.vigente === undefined) upsertFields.vigente = true;

  // Ejecutamos con retry universal (por si no existen columnas audit)
  let result;

  if (!id) {
    result = await tryInsert("insert");
    if (result?.error && /column .* does not exist/i.test(String(result.error.message || ""))) {
      result = await tryInsertWithoutAudit("insert");
    }
  } else {
    result = await tryInsert("update");
    if (result?.error && /column .* does not exist/i.test(String(result.error.message || ""))) {
      result = await tryInsertWithoutAudit("update");
    }
  }

  if (result?.error) {
    // Validaciones típicas: unique email/doc, etc.
    const msg = result.error.message || "Error";
    const isValidation = /violates|duplicate|invalid|constraint/i.test(msg);
    return json(res, isValidation ? 400 : 500, { error: "No se pudo guardar personal", details: msg });
  }

  if (!result?.data) {
    // update con id no encontrado
    if (id) return json(res, 404, { error: "No encontrado" });
    return json(res, 500, { error: "No se pudo guardar personal", details: "Sin data" });
  }

  return json(res, 200, { item: result.data });
}

export default async function handler(req, res) {
  try {
    const origin = req.headers.origin;
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

    if (req.method === "OPTIONS") return json(res, 200, { ok: true });
    if (req.method === "GET") return await handleList(req, res);
    if (req.method === "POST") return await handlePost(req, res);

    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    console.error("[api/personal] fatal:", e);
    return json(res, 500, { error: "Unexpected error", details: e?.message || String(e) });
  }
}
