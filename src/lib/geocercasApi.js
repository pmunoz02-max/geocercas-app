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

function normalizeNombreCi(nombre) {
  return String(nombre || "")
    .trim()
    .toLowerCase();
}

export async function listGeocercas({ orgId, onlyActive = true } = {}) {
  if (!orgId) return []; // tolerante: si aún no hay org, no rompe UI

  const url =
    `/api/geocercas?action=list&org_id=${encodeURIComponent(orgId)}` +
    (onlyActive ? "&onlyActive=1" : "&onlyActive=0");

  const r = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  // En nuestro diseño, list debe ser HTTP 200 siempre.
  // Aun así, si algo externo lo rompe, mantenemos error semántico.
  const data = await readJsonSafe(r);
  if (!r.ok) throw toError(data, r.status);

  // Si el backend devuelve ok:false, devolvemos [] (sin explotar UX)
  if (data?.ok === false) return [];

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

// Soft delete DB-first: activo=false
// Puedes borrar por:
// - id
// - nombre_ci
// - nombre (se normaliza a nombre_ci)
// - ids[]
// - nombres_ci[]
export async function deleteGeocerca({ orgId, id, nombre_ci, nombre, ids, nombres_ci } = {}) {
  if (!orgId) throw new Error("deleteGeocerca requiere orgId");

  const payload = {
    action: "delete",
    org_id: orgId,
  };

  if (id) payload.id = id;
  if (nombre_ci) payload.nombre_ci = String(nombre_ci);
  if (nombre) payload.nombre = String(nombre);
  if (Array.isArray(ids) && ids.length) payload.ids = ids;
  if (Array.isArray(nombres_ci) && nombres_ci.length) payload.nombres_ci = nombres_ci;

  // fallback: si viene nombre pero no nombre_ci
  if (!payload.nombre_ci && payload.nombre) payload.nombre_ci = normalizeNombreCi(payload.nombre);

  const r = await fetch("/api/geocercas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const data = await readJsonSafe(r);
  if (!r.ok) throw toError(data, r.status);

  // UX-safe: si ok:false (por ejemplo no encontró), igual devolvemos 0
  return {
    ok: data?.ok === true,
    deleted: Number(data?.deleted || 0),
    details: data?.details,
  };
}
