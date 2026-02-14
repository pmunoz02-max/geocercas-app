// api/auth/bootstrap.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

const BUILD_TAG = "auth-bootstrap-v2-set-tg_at-tg_rt-20260214";

function getBearer(req: VercelRequest): string {
  const h = req.headers["authorization"] || req.headers["Authorization"];
  if (!h || Array.isArray(h)) return "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? "";
}

function parseJsonBody(req: VercelRequest): any {
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
  // Host-only cookie (NO Domain=) => evita mezclar preview/prod
  const parts = [
    `${name}=${encodeURIComponent(value ?? "")}`,
    `Path=/`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Lax`,
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  return parts.join("; ");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, build_tag: BUILD_TAG, error: "method_not_allowed" });
      return;
    }

    const bearer = getBearer(req);
    const body = parseJsonBody(req);

    // Prefer Authorization Bearer as access_token source
    const accessToken = bearer || String(body?.access_token || "").trim();
    const refreshToken = String(body?.refresh_token || "").trim();

    if (!accessToken) {
      res.status(400).json({ ok: false, build_tag: BUILD_TAG, error: "missing_access_token" });
      return;
    }

    // TTLs (permanente/universal)
    // access: 1 hora por defecto (si no te pasan expires_in)
    const accessMaxAge = Number(body?.expires_in || 3600);
    // refresh: 30 días
    const refreshMaxAge = 60 * 60 * 24 * 30;

    const cookies: string[] = [];
    cookies.push(buildCookie("tg_at", accessToken, accessMaxAge));

    // ✅ Set tg_rt if provided (required for server-side refresh)
    if (refreshToken) {
      cookies.push(buildCookie("tg_rt", refreshToken, refreshMaxAge));
    }

    res.setHeader("Set-Cookie", cookies);
    res.setHeader("Cache-Control", "no-store");

    res.status(200).json({
      ok: true,
      build_tag: BUILD_TAG,
      has_tg_rt: Boolean(refreshToken),
    });
  } catch (e: any) {
    res.status(500).json({
      ok: false,
      build_tag: BUILD_TAG,
      error: "bootstrap_internal_error",
      detail: e?.message || String(e),
    });
  }
}
