// src/lib/geocercasApi.js
// API oficial de geocercas (UI -> /api/geocercas). No usa Supabase directo en el browser.

function normalizeError(ctx, err) {
  console.error(`[geocercasApi] ${ctx}:`, err);
  const msg = err?.message || String(err);
  return new Error(msg);
}

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // IMPORTANT: manda cookies tg_at
    body: JSON.stringify(body),
  });

  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!r.ok) {
    const msg =
      data?.error ||
      data?.message ||
      data?.details?.message ||
      `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return data;
}

/**
 * Upsert geocerca (create/update por on_conflict org_id,nombre_ci)
 */
export async function upsertGeocerca(payload) {
  try {
    const res = await postJSON("/api/geocercas", { action: "upsert", ...payload });
    return res?.geocerca ?? null;
  } catch (e) {
    throw normalizeError("upsertGeocerca", e);
  }
}
