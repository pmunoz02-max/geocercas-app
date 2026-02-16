import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";
import { requireUser } from "../_shared/authz.ts";

type Payload = {
  // ⚠️ Se ignora (frontend NO manda org_id)
  org_id?: string | null;

  // Compat (no usados para org)
  tracker_id?: string | null;
  user_id?: string | null;

  lat: number;
  lng: number;

  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  battery?: number | null;

  // Compat timestamps
  at?: string | null;
  ts?: string | null;
  recorded_at?: string | null;

  personal_id?: string | null;
  asignacion_id?: string | null;

  source?: string | null;
  is_mock?: boolean | null;
};

function num(v: unknown, name: string) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid number: ${name}`);
  return n;
}

function clampInt(v: unknown, name: string) {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) throw new Error(`Invalid integer: ${name}`);
  return n;
}

function isValidLatLng(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function parseRecordedAt(body: Payload): string {
  const raw = body.at ?? body.recorded_at ?? body.ts ?? null;
  if (!raw) return new Date().toISOString();

  // Permite epoch (ms o s)
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && String(raw).trim() !== "") {
    const ms = asNum > 1e12 ? asNum : asNum * 1000;
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) throw new Error("Invalid timestamp (epoch)");
    return d.toISOString();
  }

  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) throw new Error("Invalid timestamp (iso)");
  return d.toISOString();
}

/**
 * Resolve org_id server-owned for this user:
 * 1) user_current_org
 * 2) if exactly one org in memberships/org_members -> use it AND persist user_current_org
 * 3) if none -> error
 * 4) if multiple -> error (must pick via set_current_org flow)
 */
async function resolveOrgIdServerOwned(admin: ReturnType<typeof getAdminClient>, userId: string): Promise<string> {
  // 1) user_current_org
  {
    const { data, error } = await admin
      .from("user_current_org")
      .select("org_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(`user_current_org read failed: ${error.message}`);
    if (data?.org_id) return String(data.org_id);
  }

  // 2) collect orgs from memberships + org_members
  const orgSet = new Set<string>();

  {
    const { data, error } = await admin
      .from("memberships")
      .select("org_id")
      .eq("user_id", userId);

    if (error) throw new Error(`memberships read failed: ${error.message}`);
    (data || []).forEach((r: any) => r?.org_id && orgSet.add(String(r.org_id)));
  }

  {
    const { data, error } = await admin
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId);

    if (error) throw new Error(`org_members read failed: ${error.message}`);
    (data || []).forEach((r: any) => r?.org_id && orgSet.add(String(r.org_id)));
  }

  const orgs = Array.from(orgSet);

  if (orgs.length === 0) {
    throw new Error("No org membership found for user (memberships/org_members).");
  }

  // If exactly one, persist and return
  if (orgs.length === 1) {
    const orgId = orgs[0];

    const { error: upErr } = await admin
      .from("user_current_org")
      .upsert(
        { user_id: userId, org_id: orgId, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );

    if (upErr) throw new Error(`user_current_org upsert failed: ${upErr.message}`);
    return orgId;
  }

  // Multiple orgs but none selected
  throw new Error(
    `Multiple org memberships found for user. Must select current org (set_current_org). orgs=${orgs.join(",")}`,
  );
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    // Auth (JWT válido)
    const user = await requireUser(req);

    const body: Payload = await req.json();

    const lat = num(body.lat, "lat");
    const lng = num(body.lng, "lng");
    if (!isValidLatLng(lat, lng)) throw new Error("Invalid lat/lng range");

    const recorded_at = parseRecordedAt(body);

    const admin = getAdminClient();

    // ✅ Org server-owned (NO depende de org_id del body, NO depende de RPC)
    const orgId = await resolveOrgIdServerOwned(admin, user.id);

    const positionsTable = Deno.env.get("POSITIONS_TABLE") ?? "positions";

    // Schema real (según tu tabla D): recorded_at / created_at (default)
    const row: Record<string, unknown> = {
      org_id: orgId,
      user_id: user.id,
      personal_id: body.personal_id ?? null,
      asignacion_id: body.asignacion_id ?? null,
      lat,
      lng,
      accuracy: body.accuracy ?? null,
      speed: body.speed ?? null,
      heading: body.heading ?? null,
      battery: clampInt(body.battery, "battery"),
      is_mock: body.is_mock ?? null,
      source: body.source ?? "tracker",
      recorded_at,
    };

    const { error } = await admin.from(positionsTable).insert(row);
    if (error) throw new Error(`Insert failed: ${error.message}`);

    return new Response(JSON.stringify({ ok: true, org_id: orgId, recorded_at }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
