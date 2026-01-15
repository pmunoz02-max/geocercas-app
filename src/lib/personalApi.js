// src/lib/personalApi.js
// Cookie-auth API (TWA/WebView safe)
// Mantiene exports: listPersonal, newPersonal, upsertPersonal, toggleVigente, deletePersonal

function normalizePhone(phone) {
  if (!phone) return "";
  return String(phone).replace(/[^\d]/g, "");
}

async function requestJson(path, { method = "GET", body = null } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", "cache-control": "no-cache", pragma: "no-cache" },
    body: body ? JSON.stringify(body) : null,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = data?.error || "Request failed";
    const details = data?.details ? ` (${data.details})` : "";
    throw new Error(`${msg}${details}`);
  }

  return data;
}

export async function listPersonal({ q = "", onlyActive = true, orgId = null, limit = 500 } = {}) {
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim());
  params.set("onlyActive", onlyActive ? "1" : "0");
  params.set("limit", String(limit || 500));
  if (orgId) params.set("orgId", orgId); // compat

  const data = await requestJson(`/api/personal?${params.toString()}`, { method: "GET" });
  return Array.isArray(data?.items) ? data.items : [];
}

export async function newPersonal(payload, orgId = null) {
  const clean = { ...payload };
  delete clean.id;
  return upsertPersonal(clean, orgId);
}

export async function upsertPersonal(payload, orgId = null) {
  const nombre = (payload.nombre || "").trim();
  const email = (payload.email || "").trim().toLowerCase();
  if (!nombre) throw new Error("Nombre es obligatorio");
  if (!email) throw new Error("Email es obligatorio");

  const telefono = (payload.telefono || "").trim();
  const telefonoNorm = normalizePhone(telefono);

  let intervalMin = Number(payload.position_interval_min ?? 5);
  if (!Number.isFinite(intervalMin) || intervalMin < 5) intervalMin = 5;

  const out = {
    ...payload,
    nombre,
    email,
    telefono: telefono || null,
    telefono_norm: telefonoNorm || null,
    position_interval_min: intervalMin,
    org_id: orgId ?? payload.org_id ?? null, // compat
  };

  const data = await requestJson(`/api/personal`, { method: "POST", body: { payload: out } });
  return data?.item || null;
}

export async function toggleVigente(id) {
  const data = await requestJson(`/api/personal`, { method: "PATCH", body: { id } });
  return data?.item || null;
}

export async function deletePersonal(id) {
  const data = await requestJson(`/api/personal`, { method: "DELETE", body: { id } });
  return data?.item || null;
}
