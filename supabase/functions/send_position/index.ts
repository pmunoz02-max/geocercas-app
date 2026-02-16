import { getAdminClient } from "../_shared/supabaseAdmin.ts";
import { requireUser } from "../_shared/authz.ts";

type Payload = {
  // Ignorado: frontend NO manda org_id
  org_id?: string | null;

  tracker_id?: string | null;
  user_id?: string | null;

  lat: number;
  lng: number;

  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  battery?: number | null;

  at?: string | null;
  ts?: string | null;
  recorded_at?: string | null;

  personal_id?: string | null;
  asignacion_id?: string | null;

  source?: string | null;
  is_mock?: boolean | null;
};

function cors(origin: string | null) {
  const o = origin ?? "*";
  return {
    "Access-Control-Allow-Origin": o,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, x-api-key, content-type, x-client-info, accept, accept-language",
    "Access-Control-Expose-Headers": "content-length, content-type",
  };
}

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

  // 2) memberships + org_members
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

  throw new Error(`Multiple orgs for user; select current org first. orgs=${orgs.join(",")}`);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const C = cors(origin);

  // ✅ Handle OPTIONS (preflight)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: C });
  }

  try {
    const user = await requireUser(req);

    const body: Payload = await req.json();
    const lat = num(body.lat, "lat");
    const lng = num(body.lng, "lng");
    if (!isValidLatLng(lat, lng)) throw new Error("Invalid lat/lng range");

    const recorded_at = parseRecordedAt(body);

    const admin = getAdminClient();
    const orgId = await resolveOrgIdServerOwned(admin, user.id);

    const positionsTable = Deno.env.get("POSITIONS_TABLE") ?? "positions";

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
      headers: { ...C, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 400,
      headers: { ...C, "Content-Type": "application/json" },
    });
  }
});

