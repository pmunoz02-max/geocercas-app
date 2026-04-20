import { supabase } from "@/lib/supabaseClient";

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return "";
  return data?.session?.access_token || "";
}

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