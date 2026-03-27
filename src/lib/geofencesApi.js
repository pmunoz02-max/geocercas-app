// src/lib/geofencesApi.js
// API-first (server-owned) - Geofences v1 ctx-org
// Blindaje: NUNCA enviar columnas computadas / generated (bbox, geom, audit)

import { supabase } from "./supabaseClient";

function getJsonHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "X-Api-Version": "geofences-api-v1-ctx-org-server-owned",
    ...extra,
  };
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function getAccessToken() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    const err = new Error(error.message || "session_error");
    err.status = 401;
    throw err;
  }

  const accessToken = session?.access_token || null;

  if (!accessToken) {
    const err = new Error("missing_token");
    err.status = 401;
    throw err;
  }

  return accessToken;
}

async function requestJson(url, { method = "GET", body = null, headers = {} } = {}) {
  const accessToken = await getAccessToken();

  const res = await fetch(url, {
    method,
    headers: getJsonHeaders({
      Authorization: `Bearer ${accessToken}`,
      ...headers,
    }),
    credentials: "include",
    body: body ? JSON.stringify(body) : null,
  });

  const txt = await res.text();
  const data = txt ? safeJsonParse(txt) : null;

  if (!res.ok || (data && data.ok === false)) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = data || { ok: false, error: `HTTP ${res.status}`, details: txt };
    throw err;
  }

  return data;
}

const STRIP_FIELDS = new Set([
  // generated/computed
  "bbox",
  "geom",
  // audit
  "created_at",
  "updated_at",
  "deleted_at",
  "revoked_at",
  "created_by",
  "updated_by",
  // tenancy/ownership (server ctx)
  "org_id",
  "tenant_id",
  "user_id",
  "owner_id",
  "usuario_id",
  // bridge (server-owned)
  "source_geocerca_id",
]);

function stripComputedFields(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const k of Object.keys(out)) {
    if (STRIP_FIELDS.has(k)) delete out[k];
  }
  return out;
}

// Nueva versión compatible multi-esquema
export async function listGeofences(sbDb, orgId, onlyActive) {
  const items = [];
  const seen = new Set();
  const hasTenantId = await geofencesHasTenantId(sbDb);

  let q1 = sbDb.from("geofences").select("*").eq("org_id", orgId);
  if (onlyActive) q1 = q1.eq("active", true);

  const r1 = await q1.order("name", { ascending: true });
  if (r1.error) throw r1.error;

  for (const row of r1.data || []) {
    const id = row?.id ? String(row.id) : JSON.stringify(row);
    if (!seen.has(id)) {
      seen.add(id);
      items.push(row);
    }
  }

  if (hasTenantId) {
    let q2 = sbDb
      .from("geofences")
      .select("*")
      .is("org_id", null)
      .eq("tenant_id", orgId);

    if (onlyActive) q2 = q2.eq("active", true);

    const r2 = await q2.order("name", { ascending: true });

    if (!r2.error) {
      for (const row of r2.data || []) {
        const id = row?.id ? String(row.id) : JSON.stringify(row);
        if (!seen.has(id)) {
          seen.add(id);
          items.push(row);
        }
      }
    }
  }

  items.sort((a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || ""))
  );

  return items;
}

export async function getGeofence({ id, orgId = null, sbDb = null } = {}) {
  if (!id) throw new Error("id requerido");
  // Si se provee sbDb, usarlo (SSR/server), si no, fallback a fetch API
  if (sbDb) {
    const hasTenantId = await geofencesHasTenantId(sbDb);
    const { data, error } = await sbDb
      .from("geofences")
      .select(hasTenantId ? "*" : "*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }
  // Cliente: fetch API
  const params = new URLSearchParams();
  params.set("action", "get");
  params.set("id", String(id));
  if (orgId) params.set("orgId", String(orgId));
  const data = await requestJsonAuth(`/api/geofences?${params.toString()}`, { method: "GET" });
  return data?.item || null;
}

export async function upsertGeofence(payload = {}, sbDb = null) {
  const clean = stripComputedFields(payload);
  // Si se provee sbDb, usarlo (SSR/server), si no, fallback a fetch API
  if (sbDb) {
    // ... código de inserción ...
    // Para update:
    const hasTenantId = await geofencesHasTenantId(sbDb);
    const { data: existing, error: existingError } = await sbDb
      .from("geofences")
      .select(hasTenantId ? "id, org_id, tenant_id" : "id, org_id")
      .eq("id", clean.id)
      .maybeSingle();
    if (existingError) throw existingError;
    // ... resto del update ...
    return null; // placeholder
  }
  // Cliente: fetch API
  const data = await requestJsonAuth(`/api/geofences`, {
    method: "POST",
    body: { action: "upsert", ...clean },
  });
  if (data?.item) return data.item;
  if (Array.isArray(data?.items) && data.items.length) return data.items[0];
  return null;
}

export async function deleteGeofence({ orgId = null, id = null, sbDb = null } = {}) {
  if (!id) throw new Error("deleteGeofence: requiere id");
  if (sbDb) {
    const hasTenantId = await geofencesHasTenantId(sbDb);
    const { data: gf, error: gfErr } = await sbDb
      .from("geofences")
      .select(hasTenantId ? "id, org_id, tenant_id" : "id, org_id")
      .eq("id", id)
      .maybeSingle();
    if (gfErr) throw gfErr;
    // ... resto del delete ...
    return null; // placeholder
  }
  // Cliente: fetch API
  const payload = { action: "delete", id: String(id) };
  if (orgId) payload.orgId = String(orgId);
  const data = await requestJsonAuth(`/api/geofences`, { method: "POST", body: payload });
  console.log("[deleteGeofence response]", data);
  return {
    ok: data?.ok === true,
    mode: data?.mode || null,
    reason: data?.reason || null,
  };
}

// Helper para detectar si geofences tiene tenant_id
let __geofencesTenantIdExists = null;

async function geofencesHasTenantId(sbDb) {
  if (__geofencesTenantIdExists !== null) {
    return __geofencesTenantIdExists;
  }

  const { error } = await sbDb
    .from("geofences")
    .select("tenant_id", { head: true, count: "exact" })
    .limit(1);

  if (!error) {
    __geofencesTenantIdExists = true;
    return true;
  }

  const message = String(error.message || "").toLowerCase();
  const missingColumn =
    error.code === "42703" ||
    message.includes('column "tenant_id" does not exist') ||
    message.includes("could not find the 'tenant_id' column") ||
    message.includes("column geofences.tenant_id does not exist");

  if (missingColumn) {
    __geofencesTenantIdExists = false;
    return false;
  }

  throw new Error(`schema_probe_failed:geofences.tenant_id:${error.message}`);
}

export async function geofencesHasTenantId(sbDb) {
  const { data, error } = await sbDb
    .from("geofences")
    .select("*")
    .is("org_id", null)
    .limit(1);

  if (error) {
    throw new Error(`schema_check_failed:geofences:tenant_id:${error.message}`);
  }

  return Array.isArray(data) && data.length > 0;
}