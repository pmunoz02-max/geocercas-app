export default async function handler(req, res) {
  console.log("[send-position] handler start");
  try {
    console.log("[send-position] method", req.method);
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }
    let raw = "";
    try {
      raw = await new Promise((resolve, reject) => {
        let data = "";
        req.on("data", chunk => data += chunk);
        req.on("end", () => resolve(data));
        req.on("error", reject);
      });
    } catch (e) {
      console.error("[send-position] raw read error", e);
      return res.status(400).json({ ok: false, error: "raw_read_error", detail: String(e) });
    }

    console.log("[send-position] raw body", raw);
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error("[send-position] JSON parse error", raw);
      return res.status(400).json({ ok: false, error: "invalid_json", detail: String(e) });
    }

    console.log("[send-position] parsed keys", Object.keys(body));
    const { org_id } = body;
    console.log("[send-position] org_id", org_id);
    if (!org_id) {
      console.error("[send-position] STILL missing org_id", body);
      return res.status(400).json({ ok: false, error: "missing_org_id" });
    }

    // Forward to Supabase
    console.log("[send-position] forwarding to supabase");
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const anonKey = process.env.SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) {
        return res.status(503).json({ ok: false, error: "missing_env" });
      }
      const authHeader = req.headers.authorization || req.headers.Authorization || "";
      const upstreamUrl = `${supabaseUrl}/functions/v1/send_position`;
      const upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: authHeader,
        },
        body: JSON.stringify(body),
      });
      const text = await upstream.text();
      console.log("[send-position] supabase response", { status: upstream.status, ok: upstream.ok });
      res.status(upstream.status);
      res.setHeader(
        "Content-Type",
        upstream.headers.get("content-type") || "application/json"
      );
      return res.send(text);
    } catch (err) {
      console.error("[send-position] supabase proxy error", err);
      return res.status(500).json({ ok: false, error: "supabase_proxy_error", detail: String(err) });
    }
  } catch (err) {
    console.error("[send-position] fatal error", err);
    return res.status(500).json({ ok: false, error: "fatal_error", detail: String(err) });
  }
}