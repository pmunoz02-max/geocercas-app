// api/auth/session.js
// AUTH-SESSION-V1 – Lee tg_at (HttpOnly) y devuelve user+access_token (same-origin)

function parseCookies(cookieHeader = "") {
  const out = {};
  cookieHeader.split(";").forEach((part) => {
    const p = part.trim();
    if (!p) return;
    const i = p.indexOf("=");
    if (i < 0) return;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const version = "auth-session-v1-2026-01-13";

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ version, error: "Method Not Allowed" });
  }

  const cookies = parseCookies(req.headers.cookie || "");
  const at = cookies.tg_at || "";

  if (!at) {
    return res.status(200).json({ version, authenticated: false });
  }

  const payload = decodeJwt(at);
  if (!payload?.sub) {
    return res.status(200).json({ version, authenticated: false });
  }

  return res.status(200).json({
    version,
    authenticated: true,
    access_token: at,
    user: {
      id: payload.sub,
      email: payload.email || null,
    },
    exp: payload.exp || null,
  });
}
