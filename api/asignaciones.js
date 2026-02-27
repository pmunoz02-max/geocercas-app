// api/asignaciones.js
// PREVIEW: Minimal healthcheck to diagnose Vercel FUNCTION_INVOCATION_FAILED.
// If this endpoint still fails, the issue is project/runtime routing (not Supabase logic).

function setHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Api-Version", "asignaciones-api-min-health-v1");
}

function send(res, status, body) {
  setHeaders(res);
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const action = url.searchParams.get("action") || "";

    if (req.method === "GET" && action === "ping") {
      return send(res, 200, { ok: true, ping: true, method: req.method });
    }

    return send(res, 200, { ok: true, message: "asignaciones healthcheck", method: req.method });
  } catch (e) {
    try {
      return send(res, 500, {
        ok: false,
        error: "healthcheck_crash",
        details: String(e?.message || e),
        stack: e?.stack ? String(e.stack).split("\n").slice(0, 10) : undefined,
      });
    } catch {
      // last resort
      res.statusCode = 500;
      res.end("healthcheck_crash");
    }
  }
}
