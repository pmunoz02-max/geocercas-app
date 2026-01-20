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
  return String(nombre || "").trim().toLowerCase();
}

export async function listGeocercas({ orgId, onlyActive = true } = {}) {
  if (!orgId) return [];

  const url =
    `/api/geocercas?action=list&org_id=${encodeURIComponent(orgId)}` +
    (onlyActive ? "&onlyActive=1" : "&onlyActive=0");

  const r = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  const data = await readJsonSafe(r);
  if (!r.ok) throw toError(data, r.status);
  if (data?.ok === false) return [];

  return Array.isArray(data?.items) ? data.items : [];
}

export async function getGeocerca({ id, orgId } = {}) {
  if (!orgId || !id) return null;

  const url =
    `/api/geocercas?action=get&org_id=${encodeURIComponent(orgId)}&id=${encodeURIComponent(id)}`;

  const r = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
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

  // Normalizaciones
  const payload = {
    action: "delete",
    org_id: orgId,
  };

  if (id) payload.id = String(id);
  if (nombre_ci) payload.nombre_ci = String(nombre_ci);
  if (nombre) payload.nombre = String(nombre);

  if (Array.isArray(ids) && ids.length) payload.ids = ids.map(String);
  if (Array.isArray(nombres_ci) && nombres_ci.length) payload.nombres_ci = nombres_ci.map(String);

  // fallback: si viene nombre pero no nombre_ci
  if (!payload.nombre_ci && payload.nombre) payload.nombre_ci = normalizeNombreCi(payload.nombre);

  // ✅ BLINDAJE CRÍTICO:
  // Si no hay ningún target real (id/ids/nombre_ci/nombres_ci), NO hacemos fetch.
  const hasTargets =
    Boolean(payload.id) ||
    Boolean(payload.nombre_ci) ||
    (Array.isArray(payload.ids) && payload.ids.length > 0) ||
    (Array.isArray(payload.nombres_ci) && payload.nombres_ci.length > 0);

  if (!hasTargets) {
    return {
      ok: true,
      deleted: 0,
      skipped: true,
      details: { reason: "deleteGeocerca called without targets" },
    };
  }

  const r = await fetch("/api/geocercas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const data = await readJsonSafe(r);
  if (!r.ok) throw toError(data, r.status);

  return {
    ok: data?.ok === true,
    deleted: Number(data?.deleted || 0),
    skipped: false,
    details: data?.details,
  };
}
