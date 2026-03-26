// Helper para obtener accessToken de Supabase
async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}
// src/lib/activitiesApi.js
import { supabase } from "../lib/supabaseClient";
import { withActiveOrg } from "./withActiveOrg";

const TABLE = "activities";

export async function listActivities() {
  const accessToken = await getAccessToken();
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`/api/actividades`, {
    method: "GET",
    credentials: "include",
    headers,
  });
  const raw = await res.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch {}
  if (!res.ok) throw new Error(parsed?.error || raw || "Error");
  return Array.isArray(parsed?.data) ? parsed.data : [];
}

export async function createActivity(payload = {}, orgId = null) {
  const accessToken = await getAccessToken();
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const qs = new URLSearchParams();
  if (orgId) qs.set("org_id", String(orgId));
  const res = await fetch(`/api/actividades?${qs}`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(withActiveOrg(payload, orgId)),
  });
  const raw = await res.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch {}
  if (!res.ok) throw new Error(parsed?.error || raw || "Error");
  return parsed?.data ?? parsed;
}

export async function updateActivity(id, payload = {}, orgId = null) {
  const accessToken = await getAccessToken();
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const qs = new URLSearchParams({ id: String(id) });
  if (orgId) qs.set("org_id", String(orgId));
  const res = await fetch(`/api/actividades?${qs}`, {
    method: "PUT",
    credentials: "include",
    headers,
    body: JSON.stringify(withActiveOrg(payload, orgId)),
  });
  const raw = await res.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch {}
  if (!res.ok) throw new Error(parsed?.error || raw || "Error");
  return parsed?.data ?? parsed;
}

export async function deleteActivity(id, orgId = null) {
  const accessToken = await getAccessToken();
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const qs = new URLSearchParams({ id: String(id) });
  if (orgId) qs.set("org_id", String(orgId));
  const res = await fetch(`/api/actividades?${qs}`, {
    method: "DELETE",
    credentials: "include",
    headers,
  });
  const raw = await res.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch {}
  if (!res.ok) throw new Error(parsed?.error || raw || "Error");
  return true;
}
