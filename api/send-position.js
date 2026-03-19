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
    const body = req.body || {};

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

    const text = await upstream.text();
    console.log("[api/send-position] upstream status", upstream.status);

    res.statusCode = upstream.status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(text);
  } catch (error) {
    console.error("[api/send-position] error", error?.message || String(error));
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: error?.message || "Internal error" }));
  }
};
