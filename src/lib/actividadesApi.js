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
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json?.ok) {
    const msg = json?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return json.data ?? null;
}

export async function listActividades({ includeInactive = false, orgId = null } = {}) {
  const qs = new URLSearchParams();
  if (includeInactive) qs.set("includeInactive", "true");
  if (orgId) qs.set("org_id", String(orgId));
  const url = `/api/actividades${qs.toString() ? `?${qs}` : ""}`;
  return (await http(url, { method: "GET" })) || [];
}

export async function createActividad(payload, { orgId = null } = {}) {
  const qs = new URLSearchParams();
  if (orgId) qs.set("org_id", String(orgId));
  const url = `/api/actividades${qs.toString() ? `?${qs}` : ""}`;
  return await http(url, { method: "POST", body: payload });
}

export async function updateActividad(id, payload, { orgId = null } = {}) {
  const qs = new URLSearchParams({ id: String(id) });
  if (orgId) qs.set("org_id", String(orgId));
  return await http(`/api/actividades?${qs.toString()}`, {
    method: "PUT",
    body: payload,
  });
}

export async function deleteActividad(id, { orgId = null } = {}) {
  const qs = new URLSearchParams({ id: String(id) });
  if (orgId) qs.set("org_id", String(orgId));
  await http(`/api/actividades?${qs.toString()}`, {
    method: "DELETE",
  });
  return true;
}

export async function toggleActividadActiva(id, active, { orgId = null } = {}) {
  const qs = new URLSearchParams({ id: String(id) });
  if (orgId) qs.set("org_id", String(orgId));
  return await http(`/api/actividades?${qs.toString()}`, {
    method: "PATCH",
    body: { active },
  });
}
