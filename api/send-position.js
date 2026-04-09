export default async function handler(req, res) {
  console.log("[send-position] handler start");

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    let body = req.body;

    // 🔥 FIX SEGURO para Vercel
    if (!body) {
      console.error("[send-position] body is undefined");
      return res.status(400).json({ ok: false, error: "empty_body" });
    }

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        console.error("[send-position] JSON parse error", body);
        return res.status(400).json({ ok: false, error: "invalid_json" });
      }
    }

    console.log("[send-position] body keys:", Object.keys(body));

    const { org_id, lat, lng } = body;

    if (!org_id) {
      console.error("[send-position] missing org_id", body);
      return res.status(400).json({ ok: false, error: "missing_org_id" });
    }

    // 👉 aquí tu lógica real (Supabase)
    console.log("[send-position] org_id OK:", org_id);

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("[send-position] FATAL ERROR", err);
    return res.status(500).json({
      ok: false,
      error: "server_error",
      detail: String(err)
    });
  }
}