export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
export default async function handler(req, res) {
  try {
    let body = req.body;

    // 🔥 FIX CLAVE: asegurar parseo real
    if (!body || typeof body === "string") {
      try {
        body = JSON.parse(body || "{}");
      } catch (e) {
        console.error("[send-position] JSON parse error", e);
        return res.status(400).json({ ok: false, error: "invalid_json" });
      }
    }

    console.log("[send-position] body keys:", Object.keys(body));

    const { org_id, lat, lng } = body;

    if (!org_id) {
      console.error("[send-position] missing org_id AFTER parse", body);
      return res.status(400).json({ ok: false, error: "missing_org_id" });
    }

    // 👉 aquí sigue tu lógica normal (Supabase, etc)

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("[send-position] fatal error", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}