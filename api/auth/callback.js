// api/auth/callback.js
export const config = { runtime: "nodejs" };

function env(n) {
  const v = process.env[n];
  return v && v.trim() ? v.trim() : null;
}

function getBaseUrl(req) {
  const base = env("APP_BASE_URL") || "https://app.tugeocercas.com";
  try {
    const u = new URL(base);
    if (u.protocol !== "https:") u.protocol = "https:";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return "https://app.tugeocercas.com";
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      return;
    }

    const BASE_URL = getBaseUrl(req);

    // Construimos URL con base canónica
    const url = new URL(req.url, BASE_URL);

    // ✅ Reenviar TODO a /auth/callback (React), sin procesar.
    // Importante: el hash (#) no llega al server. Pero generateLink (invite) usa query (token_hash/type).
    const dest = new URL("/auth/callback", BASE_URL);

    // Copiamos query params tal cual (incluye code/token_hash/type/next/etc)
    url.searchParams.forEach((v, k) => dest.searchParams.set(k, v));

    res.statusCode = 302;
    res.setHeader("Location", dest.toString());
    res.end();
  } catch (e) {
    const BASE_URL = getBaseUrl(req);
    const msg = encodeURIComponent(e?.message || "callback_failed");
    res.statusCode = 302;
    res.setHeader("Location", `${BASE_URL}/login?err=${msg}`);
    res.end();
  }
}
