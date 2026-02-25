// api/tracker-proxy.js
// Proxy Vercel -> Supabase Edge Functions
// Uso: /api/tracker-proxy?fn=send_position
// Branch: preview (no mezclar con prod)

export default async function handler(req, res) {
  try {
    // CORS / preflight
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(204).end();

    const fn = String(req.query?.fn || "").trim();

    // Allowlist
    const ALLOWED = new Set(["send_position", "accept-tracker-invite"]);
    if (!ALLOWED.has(fn)) {
      return res.status(400).json({ error: "Invalid fn", allowed: Array.from(ALLOWED) });
    }

    // Server envs (Vercel Preview env vars)
    const rawBase =
      process.env.SUPABASE_FUNCTIONS_URL ||
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_FUNCTIONS_URL ||
      process.env.VITE_SUPABASE_URL ||
      "";

    const rawFullSend =
      process.env.EDGE_SEND_POSITION ||
      process.env.VITE_EDGE_SEND_POSITION ||
      "";

    const base = String(rawBase).trim().replace(/\/+$/, "");
    const fullSend = String(rawFullSend).trim();

    function buildTargetUrl(fnName) {
      if (fnName === "send_position" && fullSend) {
        if (fullSend.includes("/functions/v1/")) return fullSend;
        const b = fullSend.replace(/\/+$/, "");
        return `${b}/functions/v1/send_position`;
      }
      if (!base) return "";
      return `${base}/functions/v1/${fnName}`;
    }

    const targetUrl = buildTargetUrl(fn);
    if (!targetUrl) {
      return res.status(500).json({
        error:
          "Missing server env for Supabase functions URL. Set SUPABASE_FUNCTIONS_URL (recommended) or SUPABASE_URL in Vercel Preview env.",
      });
    }

    // Auth passthrough (required)
    const auth = req.headers?.authorization || req.headers?.Authorization || "";
    const hasBearer = typeof auth === "string" && auth.toLowerCase().startsWith("bearer ");
    if (!hasBearer) {
      return res.status(401).json({ error: "Missing Authorization Bearer token" });
    }

    // Parse body (Vercel usually gives req.body for JSON)
    let body = req.body;
    if (!body && (req.method === "POST" || req.method === "PUT")) {
      const chunks = [];
      await new Promise((resolve, reject) => {
        req.on("data", (c) => chunks.push(c));
        req.on("end", resolve);
        req.on("error", reject);
      });
      const raw = Buffer.concat(chunks).toString("utf-8").trim();
      body = raw ? JSON.parse(raw) : {};
    }
    if (!body) body = {};

    // Normalización universal: recorded_at -> at (compat con trackerApi.js)
    if (body.recorded_at && !body.at) body.at = body.recorded_at;

    // Validación mínima
    if (fn === "send_position") {
      const { lat, lng } = body || {};
      if (typeof lat !== "number" || typeof lng !== "number") {
        return res.status(400).json({ error: "Invalid lat/lng" });
      }
      if (!body.at) body.at = new Date().toISOString();
    }

    const upstream = await fetch(targetUrl, {
      method: req.method || "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: req.method === "GET" ? undefined : JSON.stringify(body),
    });

    const text = await upstream.text().catch(() => "");
    const ct = upstream.headers.get("content-type") || "";

    if (ct.includes("application/json")) {
      try {
        const json = text ? JSON.parse(text) : null;
        return res.status(upstream.status).json(json);
      } catch {
        return res.status(upstream.status).send(text);
      }
    }

    return res.status(upstream.status).send(text);
  } catch (err) {
    console.error("[tracker-proxy] error:", err?.message || err);
    return res.status(500).json({
      error: "tracker-proxy exception",
      message: err?.message || String(err),
    });
  }
}