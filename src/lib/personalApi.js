import { supabase } from "@/lib/supabaseClient";

const BASE = "/api/personal";

// 🔐 Obtener access token
async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return "";
  return data?.session?.access_token || "";
}

// 🔐 fetch universal con Bearer
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const accessToken = await getAccessToken();
    const headers = new Headers(options.headers || {});

    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

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

// 🔁 request base
async function request(method, path = "", body = null) {
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : null,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Request failed");
  }

  return res.json();
}

// 📋 LIST

export async function listPersonal(orgId = null) {
  const safeOrgId =
    typeof orgId === "string" ? orgId : orgId?.id || null;

  const qs = safeOrgId ? `?org_id=${encodeURIComponent(safeOrgId)}` : "";
  const data = await request("GET", qs);
  return data.items || [];
}

// ➕ CREATE / UPDATE

export async function upsertPersonal(payload, orgId = null) {
  const safeOrgId =
    typeof orgId === "string" ? orgId : orgId?.id || null;

  const data = await request("POST", "", {
    ...payload,
    ...(safeOrgId ? { org_id: String(safeOrgId) } : {}),
  });
  return data.item;
}

// 🔁 TOGGLE ACTIVO
export async function toggleVigente(id, vigente) {
  const data = await request("PATCH", `/${id}`, {
    vigente,
  });
  return data.item;
}

// 🗑 DELETE (soft)
export async function deletePersonal(id) {
  const data = await request("DELETE", `/${id}`);
  return data.ok;
}