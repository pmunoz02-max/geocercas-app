// src/lib/personalApi.js
// Cookie-auth API (TWA/WebView safe)
// Exports: listPersonal, newPersonal, upsertPersonal, toggleVigente, deletePersonal

function normalizePhone(phone) {
  if (!phone) return "";
  return String(phone).replace(/[^\d]/g, "");
}

function detailsToString(details) {
  if (!details) return "";
  if (typeof details === "string") return details;
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

async function requestJson(path, { method = "GET", body = null } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
    body: body ? JSON.stringify(body) : null,
  });

  const text = await res.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: "Invalid JSON response", details: text?.slice?.(0, 500) || null };
  }

  if (!res.ok) {
    const msg = data?.error || "Request failed";
    const det = data?.details ? detailsToString(data.details) : "";
    const suffix = det ? ` (${det})` : "";
    throw new Error(`${msg}${suffix}`);
  }

  return data;
}

export async function listPersonal({ q = "", onlyActive = true, limit = 500 } = {}) {
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim());
  params.set("onlyActive", onlyActive ? "1" : "0");
  params.set("limit", String(limit || 500));

  const data = await requestJson(`/api/personal?${params.toString()}`, { method: "GET" });
  return Array.isArray(data?.items) ? data.items : [];
}

export async function newPersonal(payload) {
  const clean = { ...payload };
  delete clean.id;
  return upsertPersonal(clean);
}

export async function upsertPersonal(payload) {
  const nombre = (payload.nombre || "").trim();
  const email = (payload.email || "").trim().toLowerCase();
  if (!nombre) throw new Error("Nombre es obligatorio");
  if (!email) throw new Error("Email es obligatorio");

  const telefono = (payload.telefono || "").trim();
  const telefono_norm = telefono ? normalizePhone(telefono) : null;

  const body = {
    payload: {
      ...payload,
      email,
      telefono,
      telefono_norm,
    },
  };

  const data = await requestJson("/api/personal", { method: "POST", body });
  return data?.item || null;
}

export async function toggleVigente(id) {
  if (!id) throw new Error("Missing id");
  const data = await requestJson("/api/personal", { method: "PATCH", body: { id } });
  return data?.item || null;
}

export async function deletePersonal(id) {
  if (!id) throw new Error("Missing id");
  const data = await requestJson("/api/personal", { method: "DELETE", body: { id } });
  return data?.item || null;
}
