// src/lib/geocercasApi.js
// ============================================================
// CANONICAL client for /api/geocercas (TENANT-SAFE)
// - Auth universal: Authorization Bearer desde localStorage (sb-*-auth-token)
// - No depende de cookie tg_at (evita SameSite/domain issues)
// - Permite scoping UI por orgId (si backend devuelve múltiples orgs)
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

function getSupabaseAccessTokenFromLocalStorage() {
  try {
    const keys = Object.keys(window.localStorage || {});
    const k = keys.find((x) => /^sb-.*-auth-token$/i.test(String(x)));
    if (!k) return "";
    const raw = window.localStorage.getItem(k);
    if (!raw) return "";
    const j = JSON.parse(raw);
    const token =
      j?.access_token ||
      j?.currentSession?.access_token ||
      j?.data?.session?.access_token ||
      "";
    return String(token || "").trim();
  } catch {
    return "";
  }
}

function getAuthHeadersOrThrow() {
  if (typeof window === "undefined") return {};
  const token = getSupabaseAccessTokenFromLocalStorage();
  if (!token) {
    throw new Error("No autenticado (sin access_token). Cierra sesión y vuelve a entrar.");
  }
  return { Authorization: `Bearer ${token}` };
}

async function requestJson(url, { method = "GET", body } = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(typeof window !== "undefined" ? getAuthHeadersOrThrow() : {}),
  };

  const res = await fetch(url, {
    method,
    credentials: "include", // no estorba; pero ya no dependemos de cookies
    cache: "no-store",
    headers,
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
 * Backend decide tenant + org(s).
 * Args opcionales solo para scoping UI.
 */
export async function listGeocercas({ orgId } = {}) {
  const data = await requestJson("/api/geocercas", { method: "GET" });
  const rows = normalizeRows(data);

  if (!orgId) return rows;
  return rows.filter((r) => String(r.org_id ?? "") === String(orgId));
}

/**
 * GET ONE (compat con tu NuevaGeocerca.jsx)
 */
export async function getGeocerca({ id, orgId } = {}) {
  if (!id) throw new Error("getGeocerca requiere id");
  const data = await requestJson(`/api/geocercas?id=${encodeURIComponent(id)}`, {
    method: "GET",
  });

  // Si backend devuelve lista, filtramos por id
  if (Array.isArray(data)) {
    const row = data.find((x) => String(x?.id) === String(id)) || null;
    return row;
  }

  const row = data?.row || data?.data || data;
  if (!row) return null;

  // scoping UI extra (no seguridad): evita mezclar org en UI
  if (orgId && row?.org_id && String(row.org_id) !== String(orgId)) return null;

  return row;
}

/**
 * UPSERT (canonical)
 * Backend ignora org/tenant del cliente si valida por sesión.
 */
export async function upsertGeocerca(payload = {}) {
  const nombre = payload.nombre ?? payload.name ?? "";
  if (!String(nombre).trim()) {
    throw new Error("upsertGeocerca requiere nombre");
  }

  const body = {
    ...payload,
    nombre: String(nombre).trim(),
  };

  const data = await requestJson("/api/geocercas", {
    method: "POST",
    body,
  });

  return data?.row || data?.data || data || { ok: true };
}

/**
 * DELETE (dual):
 * - Si mandas { id } → borra por id vía /api/geocercas?id=
 * - Si mandas { orgId, nombres_ci } → intenta RPC si existe endpoint /api/geocercas-bulk (si no, error claro)
 *
 * Nota: tu NuevaGeocerca.jsx llama deleteGeocerca({ orgId, nombres_ci })
 * pero tu api/geocercas.js hoy SOLO soporta delete por id.
 * Para no romper, devolvemos error explícito si no hay id.
 */
export async function deleteGeocerca(arg = {}) {
  // Caso 1: delete por id
  if (typeof arg === "string" || typeof arg === "number") {
    const id = String(arg);
    return await requestJson(`/api/geocercas?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  const id = arg?.id ? String(arg.id) : "";
  if (id) {
    return await requestJson(`/api/geocercas?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  // Caso 2 (tu UI): delete por nombres_ci (requiere endpoint dedicado o RPC en /api/geocercas)
  const nombres_ci = Array.isArray(arg?.nombres_ci) ? arg.nombres_ci : [];
  if (nombres_ci.length) {
    throw new Error(
      "deleteGeocerca({nombres_ci}) requiere endpoint bulk. Tu api/geocercas.js actualmente solo soporta DELETE por id."
    );
  }

  throw new Error("deleteGeocerca requiere id (o nombres_ci con endpoint bulk).");
}

/**
 * Backward compatibility con tu import:
 * deleteGeocerca({ orgId, nombres_ci })
 * -> Lo de arriba ya lo cubre (con error explícito si falta endpoint bulk).
 */
