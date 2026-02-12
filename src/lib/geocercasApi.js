// src/lib/geocercasApi.js
// Canonical Geocercas API (cookie HttpOnly tg_at):
// SIEMPRE via /api/geocercas y server resuelve org por ctx.

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
  const e = new Error(msg);
  e.status = status;
  e.payload = data;
  return e;
}

// Cache-buster universal
function withTs(url) {
  const ts = Date.now();
  return url.includes("?") ? `${url}&_ts=${ts}` : `${url}?_ts=${ts}`;
}

export async function listGeocercas({ onlyActive = true, limit = 2000 } = {}) {
  let url =
    `/api/geocercas?action=list` +
    (onlyActive ? "&onlyActive=1" : "&onlyActive=0") +
    `&limit=${encodeURIComponent(String(limit))}`;

  url = withTs(url);

  const r = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      Pragma: "no-cache",
    },
  });

  const data = await readJsonSafe(r);
  if (!r.ok) throw toError(data, r.status);
  if (data?.ok === false) return [];

  return Array.isArray(data?.items) ? data.items : [];
}

export async function getGeocerca({ id } = {}) {
  if (!id) return null;

  let url = `/api/geocercas?action=get&id=${encodeURIComponent(String(id))}`;
  url = withTs(url);

  const r = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      Pragma: "no-cache",
    },
  });

  const data = await readJsonSafe(r);
  if (!r.ok) throw toError(data, r.status);

  return data?.geocerca ?? null;
}

export async function upsertGeocerca(payload) {
  // org_id ya no lo valida el cliente; el server lo toma de ctx
  const r = await fetch("/api/geocercas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ action: "upsert", ...(payload || {}) }),
  });

  const data = await readJsonSafe(r);
  if (!r.ok) throw toError(data, r.status);

  return data?.geocerca ?? null;
}

export async function deleteGeocerca({ id, nombre_ci } = {}) {
  if (!id && !nombre_ci) {
    return { ok: true, deleted: 0, skipped: true, reason: "no targets" };
  }

  const payload = { action: "delete" };
  if (id) payload.id = String(id);
  if (nombre_ci) payload.nombre_ci = String(nombre_ci).toLowerCase();

  const r = await fetch("/api/geocercas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  const data = await readJsonSafe(r);
  if (!r.ok) throw toError(data, r.status);

  return { ok: data?.ok === true, deleted: Number(data?.deleted || 0), skipped: false, details: data };
}
