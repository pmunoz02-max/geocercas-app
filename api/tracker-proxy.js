// api/auth/bootstrap.ts
// ✅ Sin dependencia @vercel/node
// Endpoint: POST /api/auth/bootstrap
// Crea cookies tg_at/tg_rt desde Authorization Bearer + refresh_token en body

type ReqLike = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: any;
};

type ResLike = {
  status: (code: number) => ResLike;
  json: (obj: any) => void;
  setHeader: (name: string, value: any) => void;
  end: (txt?: string) => void;
};

function getHeader(req: ReqLike, name: string) {
  const h = req.headers || {};
  const v = h[name] ?? h[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] || "";
  return String(v || "");
}

function normalizeToken(maybeToken: string) {
  let t = String(maybeToken || "").trim();
  if (!t) return "";
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) t = t.slice(1, -1).trim();
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, "").trim();
  t = t.replace(/\s+/g, "");
  return t;
}

function makeCookie(
  name: string,
  value: string,
  opts: { maxAgeSec?: number; httpOnly?: boolean; secure?: boolean; sameSite?: "Lax" | "Strict" | "None"; path?: string } = {}
) {
  const { maxAgeSec, httpOnly = true, secure = true, sameSite = "Lax", path = "/" } = opts;
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  if (typeof maxAgeSec === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`);
  return parts.join("; ");
}

export default async function handler(req: ReqLike, res: ResLike) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      return res.status(200).end("ok");
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const auth = getHeader(req, "authorization");
    const accessToken = normalizeToken(auth);
    const refreshToken = normalizeToken(String(req.body?.refresh_token || ""));
    const expiresIn = Number(req.body?.expires_in || 3600);

    if (!accessToken || !refreshToken) {
      return res.status(400).json({ ok: false, error: "Missing access_token or refresh_token" });
    }

    const cookies: string[] = [];
    cookies.push(makeCookie("tg_at", accessToken, { maxAgeSec: Number.isFinite(expiresIn) ? expiresIn : 3600 }));
    cookies.push(makeCookie("tg_rt", refreshToken, { maxAgeSec: 60 * 60 * 24 * 30 }));

    res.setHeader("Set-Cookie", cookies);
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
