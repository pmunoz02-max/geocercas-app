// src/lib/actividadesApi.js
//
// Cliente HTTP para Actividades (NO Supabase directo).
// NO manda org_id. El backend resuelve org/rol por cookie HttpOnly tg_at
// Endpoint: /api/actividades
//
// Exporta nombres en español para coincidir con ActividadesPage.jsx:
//  - listActividades
//  - createActividad
//  - updateActividad
//  - deleteActividad
//  - toggleActividadActiva

// Manejo robusto de errores HTTP y parseo, mostrando detalle real del backend
async function http(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch {}
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    if (parsed?.error) msg += ` - ${parsed.error}`;
    if (parsed?.details) msg += ` - ${parsed.details}`;
    if (parsed?.code) msg += ` - code=${parsed.code}`;
    if (parsed?.hint) msg += ` - hint=${parsed.hint}`;
    throw new Error(msg);
  }
  return parsed;
}

export async function listActividades(options = {}) {
  const params = new URLSearchParams();
  if (options.includeInactive) params.set("includeInactive", "true");
  if (options.orgId) params.set("org_id", options.orgId);
  const parsed = await http(`/api/actividades?${params.toString()}`, { method: "GET" });
  return Array.isArray(parsed?.data) ? parsed.data : [];
}

export async function createActividad(payload, { orgId = null } = {}) {
  if (!orgId) throw new Error("[createActividad] Falta orgId en options");
  const qs = new URLSearchParams();
  qs.set("org_id", String(orgId));
  const url = `/api/actividades?${qs}`;
  const parsed = await http(url, { method: "POST", body: payload });
  return parsed?.data ?? parsed;
}

export async function updateActividad(id, payload, { orgId = null } = {}) {
  if (!orgId) throw new Error("[updateActividad] Falta orgId en options");
  const qs = new URLSearchParams({ id: String(id), org_id: String(orgId) });
  const parsed = await http(`/api/actividades?${qs.toString()}`, {
    method: "PUT",
    body: payload,
  });
  return parsed?.data ?? parsed;
}

export async function deleteActividad(id, { orgId = null } = {}) {
  if (!orgId) throw new Error("[deleteActividad] Falta orgId en options");
  const qs = new URLSearchParams({ id: String(id), org_id: String(orgId) });
  await http(`/api/actividades?${qs.toString()}`, {
    method: "DELETE",
  });
  return true;
}

export async function toggleActividadActiva(id, active, options = {}) {
  const parsed = await updateActividad(id, { active }, options);
  return parsed;
}
