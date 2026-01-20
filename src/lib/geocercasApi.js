// src/lib/geocercasApi.js
// Geocercas API-first: SIEMPRE via /api/geocercas (cookies HttpOnly).
// No usar supabase-js directo en browser para geocercas.

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
  // cache buster universal
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

export async function deleteGeocerca({ orgId, id, nombre_ci, ids, nombres_ci } = {}) {
  if (!orgId) throw new Error("deleteGeocerca requiere orgId");

  const r = await fetch("/api/geocercas", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...NO_CACHE_HEADERS },
    body: JSON.stringify({
      action: "delete",
      org_id: orgId,
      id,
      nombre_ci,
      ids,
      nombres_ci,
    }),
  });

  const data = await readJsonSafe(r);
  if (!r.ok) throw toError(data, r.status);

  return { ok: data?.ok === true, deleted: Number(data?.deleted || 0) };
}
