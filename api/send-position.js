export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
export default async function handler(req, res) {
  try {

    // ❌ NO usar más req.body directamente
    // const { org_id } = req.body;
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
    }

    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error("[send-position] JSON parse error", raw);
    }

    console.log("[send-position] RAW:", raw);
    console.log("[send-position] PARSED KEYS:", Object.keys(body));

    const { org_id } = body;

    if (!org_id) {
      console.error("[send-position] STILL missing org_id", body);
      return res.status(400).json({ ok: false, error: "missing_org_id" });
    }

    // 👉 aquí sigue tu lógica normal (Supabase, etc)

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("[send-position] fatal error", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}