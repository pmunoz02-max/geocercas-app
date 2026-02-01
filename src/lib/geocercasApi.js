// src/lib/geocercasApi.js
// ============================================================
// CANONICAL client for /api/geocercas (TENANT-SAFE)
// - Backend puede devolver múltiples orgs (si el usuario es miembro de varias)
// - La UI debe scoping por orgId activo (para evitar mezcla visual)
// ============================================================

function pickErrorMessage(payload) {
  if (!payload) return null;
  if (typeof payload === "string") return payload;
  return (
    payload.error ||
    payload.message ||
    payload.detail ||
    payload.hint ||
    (Array.isArray(payload.errors)
      ? payload.errors.map((e) => e.message || e).join(" | ")
      : null) ||
    null
  );
}

async function requestJson(url, { method = "GET", body } = {}) {
  const res = await fetch(url, {
    method,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  const ct = res.headers.get("content-type") || "";
  let payload = null;

  try {
    if (ct.includes("application/json")) payload = await res.json();
    else payload = await res.text();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const msg =
      pickErrorMessage(payload) ||
      `HTTP ${res.status} ${res.statusText || ""}`.trim() ||
      "Request failed";

    const err = new Error(msg);
    err.status = res.status;
    err.payload = payload;
    err.url = url;
    throw err;
  }

  return payload;
}

function normalizeRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

/**
 * LIST (canonical)
 * Backend decides tenant + org(s)
 */
export async function listGeocercas() {
  const data = await requestJson("/api/geocercas", { method: "GET" });
  return normalizeRows(data);
}

/**
 * LIST (scoped by active org)
 * Universal fix for "mix" when user belongs to multiple orgs.
 * This does NOT trust the client for access — it only scopes UI.
 */
export async function listGeocercasForOrg(orgId) {
  if (!orgId) return [];
  const rows = await listGeocercas();
  // Importante: requiere que el backend incluya org_id en las filas.
  return rows.filter((r) => String(r.org_id ?? "") === String(orgId));
}

/**
 * GET ONE
 */
export async function getGeocerca(id) {
  if (!id) throw new Error("getGeocerca requiere id");
  const data = await requestJson(`/api/geocercas?id=${encodeURIComponent(id)}`, {
    method: "GET",
  });
  return data?.row || data?.data || data;
}

/**
 * UPSERT (canonical)
 * Backend ignora org/tenant del cliente (si lo valida por sesión)
 */
export async function upsertGeocerca(payload = {}) {
  if (!payload?.nombre && !payload?.name) {
    throw new Error("upsertGeocerca requiere nombre");
  }

  const body = {
    ...payload,
    nombre: payload.nombre ?? payload.name,
  };

  const data = await requestJson("/api/geocercas", {
    method: "POST",
    body,
  });

  return data?.row || data?.data || data || { ok: true };
}

/**
 * DELETE
 */
export async function deleteGeocerca(id) {
  if (!id) throw new Error("deleteGeocerca requiere id");
  return await requestJson(`/api/geocercas?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
