import { createClient } from "@supabase/supabase-js";

/* =========================
   Utils
========================= */

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map((p) => p.trim());
  const found = parts.find((p) => p.startsWith(name + "="));
  if (!found) return null;
  return decodeURIComponent(found.split("=").slice(1).join("="));
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function getEnv(nameList) {
  for (const n of nameList) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

function normalizePhone(phone) {
  if (!phone) return null;
  const p = String(phone).replace(/[^\d]/g, "");
  return p || null;
}

function requireWriteRole(role) {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin";
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

function normalizeCtx(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] || null;
  return data;
}

/* =========================
   Context Resolver (robusto)
========================= */

async function resolveContext(req) {
  // Permitimos múltiples nombres (para Vercel / Vite / Next-style)
  const SUPABASE_URL = getEnv([
    "SUPABASE_URL",
    "VITE_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
  ]);

  const SUPABASE_ANON_KEY = getEnv([
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]);

  const SUPABASE_SERVICE_ROLE_KEY = getEnv([
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
  ]);

  // Error CLARO + detalles (sin exponer secretos)
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      status: 500,
      error: "Configuración incompleta del servidor (Supabase)",
      details: {
        message:
          "Faltan variables de entorno necesarias para conectar con Supabase. Configúralas en Vercel (Project Settings → Environment Variables).",
        required: [
          "SUPABASE_URL",
          "SUPABASE_ANON_KEY",
          "SUPABASE_SERVICE_ROLE_KEY",
        ],
        has: {
          SUPABASE_URL: Boolean(SUPABASE_URL),
          SUPABASE_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
          SUPABASE_SERVICE_ROLE_KEY: Boolean(SUPABASE_SERVICE_ROLE_KEY),
        },
        hint:
          "Si estás usando Vite, también puedes mapear VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (pero el API serverless usa process.env.*).",
      },
    };
  }

  const jwt = getCookie(req, "tg_at");
  if (!jwt) {
    return {
      ok: false,
      status: 401,
      error: "No autenticado",
      details: "Falta cookie tg_at",
    };
  }

  const supaUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: userData, error: userErr } = await supaUser.auth.getUser();
  if (userErr || !userData?.user) {
    return {
      ok: false,
      status: 401,
      error: "Sesión inválida",
      details: userErr?.message || "No user",
    };
  }

  // 🔒 IMPORTANTE: el RPC a veces falla si el usuario no tiene org/rol inicializado
  // En vez de romper con 500, devolvemos 403 con un mensaje accionable.
  let rpcData = null;
  try {
    const { data, error: ctxErr } = await supaUser.rpc(
      "bootstrap_session_context"
    );

    if (ctxErr) {
      console.error("[api/personal] bootstrap_session_context failed:", ctxErr);
      return {
        ok: false,
        status: 403,
        error: "Contexto no inicializado (org/rol)",
        details:
          "Tu usuario no tiene organización activa o rol asignado. Pide al administrador que te asigne un rol u organización.",
      };
    }

    rpcData = data;
  } catch (e) {
    console.error("[api/personal] bootstrap_session_context fatal:", e);
    return {
      ok: false,
      status: 403,
      error: "Contexto no inicializado (org/rol)",
      details:
        "No se pudo resolver el contexto de organización del usuario. Contacta al administrador.",
    };
  }

  const ctx = normalizeCtx(rpcData);
  if (!ctx?.org_id || !ctx?.role) {
    return {
      ok: false,
      status: 403,
      error: "Contexto incompleto: falta organización o rol",
      details: rpcData,
    };
  }

  const supaSrv = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return { ok: true, user: userData.user, ctx, supaUser, supaSrv };
}

/* =========================
   Handlers
========================= */

async function handleList(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok)
    return json(res, ctxRes.status, { error: ctxRes.error, details: ctxRes.details });

  const { ctx, supaSrv } = ctxRes;

  const url = new URL(req.url, `http://${req.headers.host}`);
  const q = (url.searchParams.get("q") || "").trim();
  const onlyActive = (url.searchParams.get("onlyActive") || "1") !== "0";
  const limit = Math.min(Number(url.searchParams.get("limit") || 500), 2000);

  let query = supaSrv
    .from("personal")
    .select("*")
    .eq("org_id", ctx.org_id)
    .eq("is_deleted", false)
    .order("nombre", { ascending: true })
    .limit(limit);

  if (onlyActive) query = query.eq("vigente", true);

  if (q) {
    const pattern = `%${q}%`;
    query = query.or(
      [
        `nombre.ilike.${pattern}`,
        `apellido.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `telefono.ilike.${pattern}`,
      ].join(",")
    );
  }

  const { data, error } = await query;
  if (error)
    return json(res, 500, { error: "No se pudo listar personal", details: error.message });

  return json(res, 200, { items: data || [] });
}

async function handleUpsert(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok)
    return json(res, ctxRes.status, { error: ctxRes.error, details: ctxRes.details });

  const { ctx, user, supaUser } = ctxRes;

  if (!requireWriteRole(ctx.role)) {
    return json(res, 403, { error: "Sin permisos", details: "Requiere rol admin u owner" });
  }

  const body = await readBody(req);
  const payload = body?.payload || body || {};
  const nowIso = new Date().toISOString();

  const nombre = (payload.nombre || "").trim();
  const apellido = (payload.apellido || "").trim();
  const email = (payload.email || "").trim().toLowerCase();
  const telefono = (payload.telefono || "").trim();
  const telefono_norm = normalizePhone(telefono);

  if (!nombre) return json(res, 400, { error: "Nombre es obligatorio" });
  if (!email) return json(res, 400, { error: "Email es obligatorio" });

  const vigente = payload.vigente === undefined ? true : !!payload.vigente;

  const baseRow = {
    nombre,
    apellido: apellido || null,
    email,
    telefono: telefono || null,
    telefono_norm,
    vigente,
    updated_at: nowIso,
  };

  // Busca duplicado por email dentro de la misma org
  const { data: existing, error: findErr } = await supaUser
    .from("personal")
    .select("id, is_deleted, vigente")
    .eq("org_id", ctx.org_id)
    .eq("email", email)
    .maybeSingle();

  if (findErr)
    return json(res, 500, { error: "No se pudo validar duplicado", details: findErr.message });

  // Si existe, revive/actualiza
  if (existing) {
    const updateRow = { ...baseRow, is_deleted: false, deleted_at: null, vigente: true };

    const { data, error } = await supaUser
      .from("personal")
      .update(updateRow)
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();

    if (error)
      return json(res, 500, { error: "No se pudo actualizar personal", details: error.message });

    return json(res, 200, { item: data, revived: true });
  }

  // Nuevo registro
  const insertRow = {
    ...baseRow,
    org_id: ctx.org_id,
    owner_id: user.id,
    created_at: nowIso,
    is_deleted: false,
  };

  const { data, error } = await supaUser
    .from("personal")
    .insert(insertRow)
    .select("*")
    .maybeSingle();

  if (error)
    return json(res, 500, { error: "No se pudo crear personal", details: error.message });

  return json(res, 200, { item: data, created: true });
}

async function handleToggle(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok)
    return json(res, ctxRes.status, { error: ctxRes.error, details: ctxRes.details });

  const { ctx, supaUser } = ctxRes;
  if (!requireWriteRole(ctx.role))
    return json(res, 403, { error: "Sin permisos", details: "Requiere rol admin u owner" });

  const body = await readBody(req);
  if (!body?.id) return json(res, 400, { error: "Missing id" });

  const nowIso = new Date().toISOString();

  const { data: row, error: rErr } = await supaUser
    .from("personal")
    .select("id, vigente, org_id, is_deleted")
    .eq("id", body.id)
    .maybeSingle();

  if (rErr) return json(res, 500, { error: "No se pudo leer registro", details: rErr.message });
  if (!row || row.is_deleted) return json(res, 404, { error: "No encontrado" });
  if (row.org_id !== ctx.org_id) return json(res, 403, { error: "Sin permisos", details: "cross-org" });

  const { data, error } = await supaUser
    .from("personal")
    .update({ vigente: !row.vigente, updated_at: nowIso })
    .eq("id", body.id)
    .eq("org_id", ctx.org_id)
    .eq("is_deleted", false)
    .select("*")
    .maybeSingle();

  if (error) return json(res, 500, { error: "No se pudo cambiar vigencia", details: error.message });
  return json(res, 200, { item: data });
}

async function handleDelete(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok)
    return json(res, ctxRes.status, { error: ctxRes.error, details: ctxRes.details });

  const { ctx, supaUser } = ctxRes;
  if (!requireWriteRole(ctx.role))
    return json(res, 403, { error: "Sin permisos", details: "Requiere rol admin u owner" });

  const body = await readBody(req);
  if (!body?.id) return json(res, 400, { error: "Missing id" });

  const nowIso = new Date().toISOString();

  const { data, error } = await supaUser
    .from("personal")
    .update({ is_deleted: true, vigente: false, deleted_at: nowIso, updated_at: nowIso })
    .eq("id", body.id)
    .eq("org_id", ctx.org_id)
    .select("*")
    .maybeSingle();

  if (error) return json(res, 500, { error: "No se pudo eliminar personal", details: error.message });
  return json(res, 200, { item: data });
}

/* =========================
   Entry
========================= */

export default async function handler(req, res) {
  try {
    const origin = req.headers.origin;
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");

    if (req.method === "OPTIONS") return json(res, 200, { ok: true });

    if (req.method === "GET") return await handleList(req, res);
    if (req.method === "POST") return await handleUpsert(req, res);
    if (req.method === "PATCH") return await handleToggle(req, res);
    if (req.method === "DELETE") return await handleDelete(req, res);

    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    console.error("[api/personal] Unexpected error:", e);
    return json(res, 500, { error: "Unexpected error", details: e?.message || String(e) });
  }
}
