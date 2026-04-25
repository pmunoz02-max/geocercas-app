
// src/lib/personalApi.js
import { supabase } from "@/lib/supabaseClient.js";

const BASE = ""; // SIEMPRE relativo al mismo dominio (evita POST fantasma)

/* =========================
   Helpers
========================= */

function withBase(path) {
  return String(path).startsWith("/")
    ? path
    : "/" + String(path);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Get access token from supabase
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    console.log("[personalApi] Token present:", !!token, token ? token.slice(0, 8) + "..." : null);
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    return await fetch(url, {
      ...options,
      headers,
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

    // Normalize for 409 Plan limit reached
    if (status === 409 && (msg.toLowerCase().includes("plan limit") || msg.toLowerCase().includes("plan reached"))) {
      const err = new Error(msg);
      err.status = status;
      err.error = parsed.json.error || msg;
      err.details = details;
      return err;
    }

    const e = new Error(
      details
        ? `${msg}: ${
            typeof details === "string"
              ? details
              : JSON.stringify(details)
          }`
        : msg
    );
    e.status = status;
    e.payload = parsed.json;
    return e;
  }

  const snippet = (parsed.text || "").trim().slice(0, 400);
  const e = new Error(
    snippet
      ? `Request failed (${status}): ${snippet}`
      : `Request failed (${status})`
  );
  e.status = status;
  e.payload = parsed.text;
  return e;
}

async function request(method, qs = "", body) {
  const url = withBase(`/api/personal${qs}`);
  // Get access token from supabase
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  console.log("[personalApi] Token present:", !!token, token ? token.slice(0, 8) + "..." : null);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const res = await fetchWithTimeout(
    url,
    {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    20000
  );

  const dataRes = await res.json();
  if (!res.ok || !dataRes?.ok) {
    const err = new Error(dataRes?.error || "Request failed");
    err.status = res.status;
    err.error = dataRes?.error || "Request failed";
    err.details = dataRes?.details || null;
    throw err;
  }
  return dataRes;
}

/* =========================
   API pública
========================= */

export async function listPersonal({ q = "", onlyActive = true, limit = 500, orgId } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("onlyActive", onlyActive ? "1" : "0");
  params.set("limit", String(limit));
  if (orgId) params.set("org_id", orgId);

  // Get access token from supabase
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  console.log("[personalApi] Token present:", !!token, token ? token.slice(0, 8) + "..." : null);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(`/api/personal?${params.toString()}`, {
    credentials: "include",
    headers,
  });

  const dataRes = await res.json();

  if (!res.ok || !dataRes?.ok) {
    throw new Error(dataRes?.error || "Error loading personnel");
  }

  return {
    items: Array.isArray(dataRes.items) ? dataRes.items : [],
    plan: dataRes.plan || null,
  };
}

export async function upsertPersonal(payload, orgId = null) {
  const data = await request("POST", "", {
    ...payload,
    ...(orgId ? { org_id: String(orgId) } : {}),
  });
  if (!data?.ok) {
    const err = new Error(data?.error || "Request failed");
    err.status = data?.status || 400;
    err.error = data?.error || "Request failed";
    err.details = data?.details || null;
    throw err;
  }
  return data.item;
}

/**
 * toggle y delete se hacen vía POST
 * (backend /api/personal solo soporta POST/GET)
 */

export async function toggleVigente(id, orgId = null) {
  const data = await request("POST", "", {
    id,
    action: "toggle",
    ...(orgId ? { org_id: String(orgId) } : {}),
  });
  if (!data?.ok) {
    const err = new Error(data?.error || "Request failed");
    err.status = data?.status || 400;
    err.error = data?.error || "Request failed";
    err.details = data?.details || null;
    throw err;
  }
  return data.item;
}

export async function deletePersonal(id, orgId = null) {
  const data = await request("POST", "", {
    id,
    action: "delete",
    ...(orgId ? { org_id: String(orgId) } : {}),
  });
  if (!data?.ok) {
    const err = new Error(data?.error || "Request failed");
    err.status = data?.status || 400;
    err.error = data?.error || "Request failed";
    err.details = data?.details || null;
    throw err;
  }
  return data.item;
}
