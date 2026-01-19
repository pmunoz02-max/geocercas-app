// src/lib/personalApi.js
const BASE =
  (import.meta?.env?.VITE_API_BASE_URL && String(import.meta.env.VITE_API_BASE_URL)) || "";

function withBase(path) {
  if (!BASE) return path;
  return BASE.replace(/\/+$/, "") + "/" + String(path).replace(/^\/+/, "");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      credentials: "include",
    });
  } finally {
    clearTimeout(t);
  }
}

async function parseAny(res) {
  const text = await res.text();
  if (!text) return { json: null, text: "" };
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

function makeError(res, parsed) {
  const status = res.status;
  if (parsed.json) {
    const msg =
      parsed.json.error ||
      parsed.json.message ||
      `Request failed (${status})`;

    const details =
      parsed.json.details ??
      parsed.json.detail ??
      parsed.json.hint ??
      null;

    const e = new Error(
      details
        ? `${msg}: ${typeof details === "string" ? details : JSON.stringify(details)}`
        : msg
    );
    e.status = status;
    e.payload = parsed.json;
    return e;
  }

  const snippet = (parsed.text || "").trim().slice(0, 400);
  const e = new Error(snippet ? `Request failed (${status}): ${snippet}` : `Request failed (${status})`);
  e.status = status;
  e.payload = parsed.text;
  return e;
}

async function request(method, qsOrEmpty = "", body) {
  const url = withBase(`/api/personal${qsOrEmpty}`);
  const res = await fetchWithTimeout(
    url,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    20000
  );

  const parsed = await parseAny(res);
  if (!res.ok) throw makeError(res, parsed);

  return parsed.json ?? {};
}

export async function listPersonal({ q = "", onlyActive = true, limit = 500 } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("onlyActive", onlyActive ? "1" : "0");
  params.set("limit", String(limit));
  const data = await request("GET", `?${params.toString()}`);
  return data.items || [];
}

export async function upsertPersonal(payload) {
  const data = await request("POST", "", payload);
  return data.item;
}

export async function toggleVigente(id) {
  const data = await request("PATCH", "", { id });
  return data.item;
}

export async function deletePersonal(id) {
  const data = await request("DELETE", "", { id });
  return data.item;
}
