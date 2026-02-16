import { getAdminClient } from "../_shared/supabaseAdmin.ts";

type Payload = {
  org_id?: string | null; // ignorado
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

function getBearer(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || "";
}

async function requireUserViaAuthAPI(req: Request): Promise<{ id: string; email?: string }> {
  const token = getBearer(req);
  if (!token) throw new Error("Missing Authorization Bearer token");

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) throw new Error("Missing SUPABASE_URL / SUPABASE_ANON_KEY");

  const r = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Auth user lookup failed (${r.status}): ${txt || r.statusText}`);
  }

  const u = await r.json();
  if (!u?.id) throw new Error("Auth user lookup returned no id");
  return { id: String(u.id), email: u.email ? String(u.email) : undefined };
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
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
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

/**
 * ✅ Resolver canónico (universal):
 * - Fuente: user_current_org
 * - Fallback: memberships + org_members
 * - Si encuentra exactamente 1 org => la persiste en user_current_org
 * - Si encuentra 2+ orgs => ERROR (no elige "min uuid", no persiste nada)
 */
async function resolveOrgIdServerOwned(
  admin: ReturnType<typeof getAdminClient>,
  userId: string
): Promise<string> {
  // 1) user_current_org
  const uco = await admin
    .from("user_current_org")
    .select("org_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (uco.error) throw new Error(`user_current_org read failed: ${uco.error.message}`);
  if (uco.data?.org_id) return String(uco.data.org_id);

  // 2) memberships + org_members
  const orgs = new Set<string>();

  const m = await admin.from("memberships").select("org_id").eq("user_id", userId);
  if (m.error) throw new Error(`memberships read failed: ${m.error.message}`);
  (m.data || []).forEach((r: any) => r?.org_id && orgs.add(String(r.org_id)));

  const om = await admin.from("org_members").select("org_id").eq("user_id", userId);
  if (om.error) throw new Error(`org_members read failed: ${om.error.message}`);
  (om.data || []).forEach((r: any) => r?.org_id && orgs.add(String(r.org_id)));

  const arr = Array.from(orgs);
  if (arr.length === 0) throw new Error("No org membership found for user.");

  // ✅ 1 org => persistimos y retornamos
  if (arr.length === 1) {
    const orgId = arr[0];
    const up = await admin.from("user_current_org").upsert(
      { user_id: userId, org_id: orgId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    if (up.error) throw new Error(`user_current_org upsert failed: ${up.error.message}`);
    return orgId;
  }

  // ✅ 2+ orgs => error explícito (no persistimos nada)
  throw new Error(
    `Multiple org memberships found for user. Please select current org (set_current_org) before sending positions. orgs=${arr.join(
      ","
    )}`
  );
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const C = cors(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: C });

  try {
    const user = await requireUserViaAuthAPI(req);

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
      source: body.source ?? "tracker-gps-web",
      recorded_at,
    };

    const ins = await admin.from(positionsTable).insert(row);
    if (ins.error) throw new Error(`Insert failed: ${ins.error.message}`);

    return new Response(JSON.stringify({ ok: true, org_id: orgId, recorded_at }), {
      headers: { ...C, "Content-Type": "application/json" },
    });
  } catch (e) {
    // ✅ Si falla por multi-org, devolvemos 400 (no 401)
    const msg = String(e?.message || e);
    const status =
      msg.includes("Multiple org memberships") || msg.includes("No org membership")
        ? 400
        : 401;

    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status,
      headers: { ...C, "Content-Type": "application/json" },
    });
  }
});
