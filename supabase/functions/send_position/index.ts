import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sha256Hex(value: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }

    const authHeader = req.headers.get("x-runtime-token") || "";
    const runtimeToken = authHeader.trim();

    if (!runtimeToken) {
      return json({ ok: false, error: "missing_runtime_token" }, 401);
    }

    const accessTokenHash = await sha256Hex(runtimeToken);

    // 🔥 BUSCAR SESIÓN
    const sessionRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tracker_runtime_sessions?select=*&access_token_hash=eq.${accessTokenHash}&active=eq.true&limit=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    const sessions = await sessionRes.json();

    if (!sessions || sessions.length === 0) {
      return json({ ok: false, error: "runtime_session_not_found" }, 401);
    }

    const session = sessions[0];

    const body = await req.json();

    const payload = {
      user_id: session.tracker_user_id,
      org_id: session.org_id,
      lat: body.lat,
      lng: body.lng,
      accuracy: body.accuracy ?? null,
      speed: body.speed ?? null,
      heading: body.heading ?? null,
      battery: body.battery ?? null,
      is_mock: body.is_mock ?? null,
      source: body.source || "tracker-native-android",
      recorded_at: body.recorded_at || new Date().toISOString(),
    };

    // 🔥 INSERT POSITION
    const insertRes = await fetch(
      `${SUPABASE_URL}/rest/v1/positions`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!insertRes.ok) {
      const txt = await insertRes.text();
      return json({ ok: false, error: "insert_failed", detail: txt }, 500);
    }

    // 🔥 UPDATE last_seen_at
    await fetch(
      `${SUPABASE_URL}/rest/v1/tracker_runtime_sessions?id=eq.${session.id}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      }
    );

    return json({ ok: true });

  } catch (error) {
    return json({
      ok: false,
      error: "send_position_failed",
      detail: String(error),
    }, 500);
  }
});