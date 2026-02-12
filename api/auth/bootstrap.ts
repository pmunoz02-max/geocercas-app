// api/auth/bootstrap.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

function getBearer(req: VercelRequest): string {
  const h = req.headers["authorization"] || req.headers["Authorization"];
  if (!h || Array.isArray(h)) return "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? "";
}

function parseJsonBody(req: VercelRequest): any {
  // Vercel node api a veces ya parsea req.body si viene JSON
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function buildCookie(name: string, value: string, maxAgeSeconds: number): string {
  // Cookie robusta para HTTPS (preview.tugeocercas.com)
  // SameSite=Lax permite navegación normal y es lo más compatible para magic links.
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=/`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Lax`,
    `Max-Age=${maxAgeSeconds}`,
  ];
  return parts.join("; ");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    const bearer = getBearer(req);
    const body = parseJsonBody(req);
    const token = bearer || (body?.access_token as string) || "";

    if (!token) {
      res.status(400).json({ ok: false, error: "missing_access_token" });
      return;
    }

    // 30 días (ajústalo si quieres)
    const maxAge = 60 * 60 * 24 * 30;

    // Set cookie tg_at
    res.setHeader("Set-Cookie", buildCookie("tg_at", token, maxAge));

    // Opcional: evitar cache
    res.setHeader("Cache-Control", "no-store");

    res.status(200).json({ ok: true });
  } catch (e: any) {
    // Nunca reventar — devolver error controlado
    res
      .status(500)
      .json({ ok: false, error: "bootstrap_internal_error", detail: e?.message || String(e) });
  }
}
