// src/lib/geocercasApi.js
// API de Geocercas (cookies HttpOnly tg_at): SIEMPRE via /api/geocercas
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

export async function listGeocercas({ orgId, onlyActive = true } = {}) {
  if (!orgId) return []; // tolerante: si aún no hay org, no rompe UI

  const url =
    `/api/geocercas?action=list&org_id=${encodeURIComponent(orgId)}` +
    (onlyActive ? "&onlyActive=1" : "");

  const r = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  const data = await readJsonSafe(r);
  if (!r.ok) throw toError(data, r.status);

  return Array.isArray(data?.items) ? data.items : [];
}

export async function getGeocerca({ id, orgId }) {
  if (!orgId || !id) return null;

  const url =
    `/api/geocercas?action=get&org_id=${encodeURIComponent(orgId)}&id=${encodeURIComponent(id)}`;

  const r = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  const data = await readJsonSafe(r);
  if (!r.ok) throw toError(data, r.status);

  return data?.geocerca ?? null;
}

export async function upsertGeocerca(payload) {
  if (!payload?.org_id) throw new Error("upsertGeocerca requiere org_id");

  const r = await fetch("/api/geocercas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "upsert", ...payload }),
  });

  const data = await readJsonSafe(r);
  if (!r.ok) throw toError(data, r.status);

  return data?.geocerca ?? null;
}

// Delete lo hacemos en el siguiente paso (soft delete DB-first)
export async function deleteGeocerca() {
  throw new Error("deleteGeocerca pendiente: se implementará vía /api/geocercas (soft delete)");
}
