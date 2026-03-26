// src/lib/actividadesApi.js
//
// Cliente HTTP para Actividades (NO Supabase directo).
// Endpoint: /api/actividades
//
// Exporta nombres en español para coincidir con ActividadesPage.jsx:
//  - listActividades
//  - createActividad
//  - updateActividad
//  - deleteActividad
//  - toggleActividadActiva

import { supabase } from "../supabaseClient";

// Obtiene access token actual de Supabase si existe.
// Si no existe, igual seguimos con credentials: "include"
// para que el backend pueda autenticar por cookie.
async function getAccessToken() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

// Manejo robusto de errores HTTP y parseo, mostrando detalle real del backend
async function http(path, { method = "GET", body } = {}) {
  const accessToken = await getAccessToken();

  const headers = {
    "Content-Type": "application/json",
    "cache-control": "no-cache",
    pragma: "no-cache",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(path, {
    method,
    credentials: "include",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await res.text();

  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw || null;
  }

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
  if (options.orgId) params.set("org_id", String(options.orgId));

  const query = params.toString();
  const url = query ? `/api/actividades?${query}` : `/api/actividades`;

  const parsed = await http(url, { method: "GET" });

  if (Array.isArray(parsed)) return parsed;
  return Array.isArray(parsed?.data) ? parsed.data : [];
}

export async function createActividad(payload, { orgId = null } = {}) {
  if (!orgId) throw new Error("[createActividad] Falta orgId en options");

  const qs = new URLSearchParams();
  qs.set("org_id", String(orgId));

  const url = `/api/actividades?${qs.toString()}`;
  const parsed = await http(url, { method: "POST", body: payload });

  return parsed?.data ?? parsed;
}

export async function updateActividad(id, payload, { orgId = null } = {}) {
  if (!orgId) throw new Error("[updateActividad] Falta orgId en options");

  const qs = new URLSearchParams({
    id: String(id),
    org_id: String(orgId),
  });

  const parsed = await http(`/api/actividades?${qs.toString()}`, {
    method: "PUT",
    body: payload,
  });

  return parsed?.data ?? parsed;
}

export async function deleteActividad(id, { orgId = null } = {}) {
  if (!orgId) throw new Error("[deleteActividad] Falta orgId en options");

  const qs = new URLSearchParams({
    id: String(id),
    org_id: String(orgId),
  });

  await http(`/api/actividades?${qs.toString()}`, {
    method: "DELETE",
  });

  return true;
}

export async function toggleActividadActiva(id, active, options = {}) {
  const parsed = await updateActividad(id, { active }, options);
  return parsed;
}