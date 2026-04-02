import { supabase } from "@/lib/supabaseClient";

async function parseBodySafe(response) {
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { text, json };
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }
  return data?.session?.access_token || "";
}

async function refreshAccessToken() {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    throw error;
  }
  return data?.session?.access_token || "";
}

function buildHeaders(baseHeaders = {}, token = "") {
  const headers = new Headers(baseHeaders || {});

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

export async function fetchWithAuth(input, init = {}) {
  const method = String(init.method || "GET").toUpperCase();
  const credentials = init.credentials || "include";

  let token = "";
  try {
    token = await getAccessToken();
  } catch (e) {
    console.warn("[fetchWithAuth] getAccessToken failed", e);
  }

  const doRequest = async (bearerToken) => {
    const headers = buildHeaders(init.headers, bearerToken);

    const response = await fetch(input, {
      ...init,
      method,
      credentials,
      headers,
    });

    const body = await parseBodySafe(response);

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      response,
      json: body.json,
      text: body.text,
    };
  };

  let result = await doRequest(token);

  if (result.status === 401) {
    try {
      const refreshedToken = await refreshAccessToken();

      if (refreshedToken) {
        console.warn("[fetchWithAuth] retry once after refreshSession", {
          url: typeof input === "string" ? input : "(Request object)",
        });
        result = await doRequest(refreshedToken);
      }
    } catch (e) {
      console.warn("[fetchWithAuth] refreshSession failed", e);
    }
  }

  return result;
}

export async function fetchJsonWithAuth(input, init = {}) {
  const result = await fetchWithAuth(input, init);

  if (!result.ok) {
    const message =
      result.json?.error ||
      result.json?.message ||
      result.text ||
      `HTTP ${result.status} ${result.statusText}`;

    const err = new Error(message);
    err.status = result.status;
    err.payload = result.json;
    err.raw = result.text;
    throw err;
  }

  return result.json;
}