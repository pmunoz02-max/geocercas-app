// src/lib/geocercasApi.js
// Geocercas API-first: SIEMPRE via /api/geocercas (cookies HttpOnly tg_at)
// No usar supabase-js directo en el browser para geocercas.

async function readJsonSafe(r) {
  const text = await r.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

function toError(data, status) {
  const msg =
    data?.error ||
    data?.message ||
    data?.details?.message ||
    (typeof data === "string" ? data : null) ||
    `HTTP ${status}`;
  return new Error(msg);
}

function normalizeNombreCi(nombre) {
  return String(nombre || "").trim().toLowerCase();
}

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-cache, no-store, max-age=0",
  Pragma: "no-cache",
};

function qs(obj) {
  const u = new URLSearchParams();
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    u.set(k, String(v));
  });
  // cache-buster universal (evita cache en preview, navegadores y SW)
  u.set("_ts", String(Date.now()));
  return u.toString();
}

export async function listGeocercas({ orgId, onlyActive = true } = {}) {
  if (!orgId) return [];

  const url = `/api/geocercas?${qs({
    action: "list",
    org_id: orgId,
    onlyActive: onlyActive ? 1 : 0,
  })}`;

  const r = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: NO_CACHE_HEADERS,
  });

  const data = await readJsonSafe(r);
  if (!r.ok) throw toError(data, r.status);

  if (data?.ok === false) return [];
  return Array.isArray(data?.items) ? data.items : [];
}

export async function getGeocerca({ id, orgId } = {}) {
  if (!orgId || !id) return null;

  const url = `/api/geocercas?${qs({
    action: "get",
    org_id: orgId,
    id,
  })}`;

  const r = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: NO_CACHE_HEADERS,
  });

  const data = await readJsonSafe(r);
  if (!r.ok) throw toError(data, r.status);

  return data?.geocerca ?? null;
}

export async function upsertGeocerca(payload) {
  if (!payload?.org_id) throw new Error("upsertGeocerca requiere org_id");

  const r = await fetch("/api/geocercas", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...NO_CACHE_HEADERS },
    body: JSON.stringify({ action: "upsert", ...payload }),
  });

  const data = await readJsonSafe(r);
  if (!r.ok) throw toError(data, r.status);

  return data?.geocerca ?? null;
}

export async function deleteGeocerca({ orgId, id, nombre_ci, nombre, ids, nombres_ci } = {}) {
  if (!orgId) throw new Error("deleteGeocerca requiere orgId");

  const payload = { action: "delete", org_id: orgId };

  if (id) payload.id = id;
  if (nombre_ci) payload.nombre_ci = String(nombre_ci);
  if (nombre) payload.nombre = String(nombre);
  if (Array.isArray(ids) && ids.length) payload.ids = ids;
  if (Array.isArray(nombres_ci) && nombres_ci.length) payload.nombres_ci = nombres_ci;

  if (!payload.nombre_ci && payload.nombre) payload.nombre_ci = normalizeNombreCi(payload.nombre);

  const r = await fetch("/api/geocercas", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...NO_CACHE_HEADERS },
    body: JSON.stringify(payload),
  });

  const data = await readJsonSafe(r);
  if (!r.ok) throw toError(data, r.status);

  return { ok: data?.ok === true, deleted: Number(data?.deleted || 0), details: data?.details };
}
