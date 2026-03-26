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

// Manejo robusto de errores HTTP y parseo
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
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.error) msg += ` - ${parsed.error}`;
      else if (raw) msg += ` - ${raw}`;
    } catch {
      if (raw) msg += ` - ${raw}`;
    }
    throw new Error(msg);
  }
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`HTTP ${res.status} - invalid JSON response: ${raw}`);
  }
}

export async function listActividades(options = {}) {
  const params = new URLSearchParams();
  if (options.includeInactive) params.set("includeInactive", "true");
  if (options.orgId) params.set("org_id", options.orgId);
  const res = await fetch(`/api/actividades?${params.toString()}`, {
    method: "GET",
    credentials: "include",
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} - ${raw || "unknown backend error"}`);
  }
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    throw new Error(`HTTP ${res.status} - invalid JSON response: ${raw}`);
  }
}

export async function createActividad(payload, { orgId = null } = {}) {
  if (!orgId) throw new Error("[createActividad] Falta orgId en options");
  const qs = new URLSearchParams();
  qs.set("org_id", String(orgId));
  const url = `/api/actividades?${qs}`;
  return await http(url, { method: "POST", body: payload });
}

export async function updateActividad(id, payload, { orgId = null } = {}) {
  if (!orgId) throw new Error("[updateActividad] Falta orgId en options");
  const qs = new URLSearchParams({ id: String(id), org_id: String(orgId) });
  return await http(`/api/actividades?${qs.toString()}`, {
    method: "PUT",
    body: payload,
  });
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
  return updateActividad(id, { active }, options);
}
