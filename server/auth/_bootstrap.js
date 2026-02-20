// server/auth/_bootstrap.js
// ✅ Vercel-compatible (JS puro fuera de /api)

function getHeader(req, name) {
  const h = req?.headers || {};
  const key = String(name || "").toLowerCase();
  const v = h[name] ?? h[key];
  if (Array.isArray(v)) return v[0] || "";
  return String(v || "");
}

function normalizeToken(maybeToken) {
  let t = String(maybeToken || "").trim();
  if (!t) return "";
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, "").trim();
  return t.replace(/\s+/g, "");
}

function makeCookie(name, value, opts = {}) {
  const { maxAgeSec, httpOnly = true, secure = true, sameSite = "Lax", path = "/" } = opts;
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  if (typeof maxAgeSec === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`);
  return parts.join("; ");
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      return res.status(200).send("ok");
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const auth = getHeader(req, "authorization");
    const accessToken = normalizeToken(auth);
    const refreshToken = normalizeToken(req?.body?.refresh_token || "");
    const expiresIn = Number(req?.body?.expires_in || 3600);

    if (!accessToken || !refreshToken) {
      return res.status(400).json({ ok: false, error: "Missing access_token or refresh_token" });
    }

    const cookies = [];
    cookies.push(makeCookie("tg_at", accessToken, { maxAgeSec: Number.isFinite(expiresIn) ? expiresIn : 3600 }));
    cookies.push(makeCookie("tg_rt", refreshToken, { maxAgeSec: 60 * 60 * 24 * 30 }));

    res.setHeader("Set-Cookie", cookies);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
