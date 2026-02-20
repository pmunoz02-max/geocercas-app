// api/auth/index.js
// Único endpoint para /api/auth/* (Hobby friendly)
// ✅ Universal/permanente:
// - Lazy-load por route (evita 500 por imports que fallen)
// - Extensión .js explícita (ESM estable en Vercel)

const ROUTES = new Set([
  "bootstrap",
  "ensure-context",
  "magic",
  "password",
  "recover",
  "session",
]);

async function loadHandler(route) {
  switch (route) {
    case "bootstrap":
      return (await import("../../server/auth/_bootstrap.js")).default;
    case "ensure-context":
      return (await import("../../server/auth/_ensure-context.js")).default;
    case "magic":
      return (await import("../../server/auth/_magic.js")).default;
    case "password":
      return (await import("../../server/auth/_password.js")).default;
    case "recover":
      return (await import("../../server/auth/_recover.js")).default;
    case "session":
      return (await import("../../server/auth/_session.js")).default;
    default:
      return null;
  }
}

export default async function handler(req, res) {
  try {
    const route = String(req.query?.route || "").trim();

    if (!ROUTES.has(route)) {
      return res.status(404).json({
        ok: false,
        error: "AUTH_ROUTE_NOT_FOUND",
        got: route,
        expected: Array.from(ROUTES),
      });
    }

    const fn = await loadHandler(route);
    if (typeof fn !== "function") {
      return res.status(500).json({
        ok: false,
        error: "AUTH_HANDLER_LOAD_FAILED",
        route,
      });
    }

    return fn(req, res);
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "AUTH_INDEX_EXCEPTION",
      detail: String(e?.message || e),
    });
  }
}
