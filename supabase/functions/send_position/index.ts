import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";
import { requireUser } from "../_shared/authz.ts";

type Payload = {
  org_id?: string;
  tracker_id?: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  altitude?: number;
  ts?: string;          // ISO string or epoch string
  device_id?: string;
  extra?: Record<string, unknown>;
};

function num(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("Invalid number");
  return n;
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    // Only requires a valid user JWT by default (works for trackers)
    const user = await requireUser(req);

    const body: Payload = await req.json();
    const lat = num(body.lat);
    const lng = num(body.lng);

    const positionsTable = Deno.env.get("POSITIONS_TABLE") ?? "positions";
    // Recommended schema: org_id uuid, tracker_id uuid/text, user_id uuid, lat double, lng double, accuracy double, ts timestamptz, payload jsonb
    const row: any = {
      user_id: user.id,
      org_id: body.org_id ?? null,
      tracker_id: body.tracker_id ?? null,
      lat,
      lng,
      accuracy: body.accuracy ?? null,
      speed: body.speed ?? null,
      heading: body.heading ?? null,
      altitude: body.altitude ?? null,
      ts: body.ts ?? new Date().toISOString(),
      device_id: body.device_id ?? null,
      payload: body.extra ?? null,
    };

    const supabase = getAdminClient();
    const { error } = await supabase.from(positionsTable).insert(row);
    if (error) throw new Error(error.message);

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
