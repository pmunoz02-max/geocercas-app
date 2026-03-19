module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
    return;
  }

  try {
    console.log("[api/send-position] POST received");

    const authHeader = String(req.headers.authorization || "");
    const contentType = String(req.headers["content-type"] || "");

    console.log("[api/send-position] auth header present", !!authHeader);
    console.log("[api/send-position] content-type", contentType);

    // Safely resolve JSON body — req.body may already be parsed by Vercel middleware.
    let body;
    if (req.body && typeof req.body === "object") {
      body = req.body;
    } else {
      const raw = typeof req.body === "string" ? req.body : await new Promise((resolve, reject) => {
        let data = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => resolve(data));
        req.on("error", reject);
      });
      try {
        body = JSON.parse(raw);
      } catch (parseErr) {
        console.error("[api/send-position] invalid json", parseErr?.message || String(parseErr));
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "invalid_json" }));
        return;
      }
    }

    console.log("[api/send-position] body keys", Object.keys(body || {}));
    console.log("[api/send-position] forwarding to supabase edge");

    const upstream = await fetch(
      "https://mujwsfhkocsuuahlrssn.supabase.co/functions/v1/send_position",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify(body),
      }
    );

    const upstreamText = await upstream.text();

    console.log("[api/send-position] upstream status", upstream.status);
    console.log("[api/send-position] upstream body", upstreamText);

    res.statusCode = upstream.status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    if (upstreamText) {
      res.end(upstreamText);
    } else {
      res.end(JSON.stringify({
        ok: upstream.ok,
        status: upstream.status,
        error: upstream.ok ? null : "empty_upstream_body",
      }));
    }
  } catch (error) {
    console.error("[api/send-position] error", error?.message || String(error));
    console.error("[api/send-position] stack", error?.stack || "(no stack)");
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      ok: false,
      error: error?.message || "proxy_error",
      stack: error?.stack || null,
    }));
  }
};
