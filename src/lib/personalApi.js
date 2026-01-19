// src/lib/personalApi.js
// Robust API client for /api/personal
// - Always includes cookies (tg_at)
// - Safe JSON parsing (handles HTML/text too)
// - Throws with backend error/details
// - Timeout to avoid "processing forever"

const DEFAULT_BASE =
  (import.meta?.env?.VITE_API_BASE_URL && String(import.meta.env.VITE_API_BASE_URL)) || "";

function withBase(path) {
  if (!DEFAULT_BASE) return path;
  return DEFAULT_BASE.replace(/\/+$/, "") + "/" + String(path).replace(/^\/+/, "");
}

async function safeParseResponse(res) {
  const text = await res.text(); // always read once
  if (!text) return { asText: "", asJson: null };

  try {
    const json = JSON.parse(text);
    return { asText: text, asJson: json };
  } catch {
    return { asText: text, asJson: null };
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      credentials: "include", // IMPORTANT: send HttpOnly cookies to Vercel API
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

function buildError(res, parsed) {
  const status = res?.status || 0;

  // Prefer JSON {error, details}
  if (parsed?.asJson) {
    const msg =
      parsed.asJson.error ||
      parsed.asJson.message ||
      `Request failed (${status})`;

    const details =
      parsed.asJson.details ||
      parsed.asJson.detail ||
      parsed.asJson.hint ||
      null;

    const e = new Error(details ? `${msg}: ${typeof details === "string" ? details : JSON.stringify(details)}` : msg);
    e.status = status;
    e.payload = parsed.asJson;
    return e;
  }

  // Fallback: text (could be HTML from Vercel)
  const text = (parsed?.asText || "").trim();
  const e = new Error(text ? `Request failed (${status}): ${text.slice(0, 250)}` : `Request failed (${status})`);
  e.status = status;
  e.payload = text;
  return e;
}

async function requestPersonal(method, path, body) {
  const url = withBase(`/api/personal${path || ""}`);

  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };

  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetchWithTimeout(url, opts, 20000);

  const parsed = await safeParseResponse(res);

  if (!res.ok) {
    throw buildError(res, parsed);
  }

  // OK response
  return parsed.asJson ?? {};
}

export async function listPersonal({ q = "", onlyActive = true, limit = 500 } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("onlyActive", onlyActive ? "1" : "0");
  params.set("limit", String(limit));

  const data = await requestPersonal("GET", `?${params.toString()}`);
  // API returns { items: [...] }
  return data.items || [];
}

export async function upsertPersonal(payload) {
  const data = await requestPersonal("POST", "", payload);
  return data.item;
}

export async function toggleVigente(id) {
  const data = await requestPersonal("PATCH", "", { id });
  return data.item;
}

export async function deletePersonal(id) {
  const data = await requestPersonal("DELETE", "", { id });
  return data.item;
}
