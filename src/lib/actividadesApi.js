// src/lib/activitiesApi.js
//
// Cliente HTTP para Activities (NO Supabase directo).
// NO manda org_id. El backend resuelve org/rol por cookie HttpOnly tg_at
// Endpoint: /api/actividades

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

// Mantengo tus nombres de funciones actuales para compatibilidad:
export async function listActivities({ includeInactive = false } = {}) {
  const qs = new URLSearchParams();
  if (includeInactive) qs.set("includeInactive", "true");
  const url = `/api/actividades${qs.toString() ? `?${qs}` : ""}`;
  return (await http(url, { method: "GET" })) || [];
}

export async function createActivity(payload) {
  return await http("/api/actividades", { method: "POST", body: payload });
}

export async function updateActivity(id, payload) {
  return await http(`/api/actividades?id=${encodeURIComponent(id)}`, {
    method: "PUT",
    body: payload,
  });
}

export async function deleteActivity(id) {
  await http(`/api/actividades?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return true;
}

// Extra opcional (por si lo usas en UI):
export async function toggleActivityActive(id, active) {
  return await http(`/api/actividades?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { active },
  });
}
