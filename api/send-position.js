import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  console.log("[send-position] request started", { hasAuth: !!authHeader });

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    let body = req.body;
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

    const { org_id, lat, lng, accuracy, timestamp } = body;
    console.log("[send-position] payload", { org_id, lat, lng, accuracy, timestamp });

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "missing_bearer_token" });
    }
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return res.status(401).json({ ok: false, error: "empty_token" });
    }

    // Validar el token y obtener el tracker_user_id real
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      console.error("[send-position] invalid tracker token", userError);
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }
    const tracker_user_id = userData.user.id;
    console.log("[send-position] tracker resolved", { tracker_user_id });

    // Insertar en positions
    const insertPayload = {
      org_id,
      user_id: tracker_user_id,
      lat,
      lng,
      accuracy: accuracy ?? null,
      ts: timestamp ?? new Date().toISOString(),
    };
    const { data: insertResult, error: insertError } = await supabase
      .from("positions")
      .insert([insertPayload])
      .select();
    if (insertError) {
      console.error("[send-position] positions insert error", insertError);
      return res.status(500).json({ ok: false, error: "positions_insert_failed", detail: insertError.message });
    }
    console.log("[send-position] positions insert ok", insertResult);

    // Upsert/update tracker_latest
    const latestPayload = {
      org_id,
      user_id: tracker_user_id,
      lat,
      lng,
      accuracy: accuracy ?? null,
      ts: timestamp ?? new Date().toISOString(),
    };
    const { data: latestResult, error: latestError } = await supabase
      .from("tracker_latest")
      .upsert([latestPayload], { onConflict: ["org_id", "user_id"] })
      .select();
    if (latestError) {
      console.error("[send-position] tracker_latest upsert error", latestError);
      return res.status(500).json({ ok: false, error: "tracker_latest_upsert_failed", detail: latestError.message });
    }
    console.log("[send-position] tracker_latest upsert ok", latestResult);

    return res.status(200).json({ ok: true, position: insertResult?.[0] ?? null });

  } catch (error) {
    console.error("[send-position] error", error);
    return res.status(500).json({
      ok: false,
      error: "server_error",
      detail: String(error)
    });
  }
}