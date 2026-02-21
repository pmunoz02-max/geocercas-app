// supabase/functions/send_position/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";

type Payload = {
  org_id?: string | null; // ignorado (server-owned)
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

const BUILD_TAG = "send_position-v3-universal-getclaims-novfyjwt-20260220";

function cors(origin: string | null) {
  const o = origin ?? "*";
  return {
    "Access-Control-Allow-Origin": o,
    Vary: "Origin",
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

  const d = new Date(String(raw));
  if (!Number.isFinite(d.getTime())) throw new Error("Invalid timestamp (iso)");
  return d.toISOString();
}

function extractBearer(req: Request): { token: string; authHeader: string } | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  if (!token) return null;
  return { token, authHeader: `Bearer ${token}` };
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
  const uco = await admin
    .from("user_current_org")
    .select("org_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (uco.error) throw new Error(`user_current_org read failed: ${uco.error.message}`);
  if (uco.data?.org_id) return String(uco.data.org_id);

  const orgs = new Set<string>();

  const m = await admin.from("memberships").select("org_id").eq("user_id", userId);
  if (m.error) throw new Error(`memberships read failed: ${m.error.message}`);
  (m.data || []).forEach((r: any) => r?.org_id && orgs.add(String(r.org_id)));

  const om = await admin.from("org_members").select("org_id").eq("user_id", userId);
  if (om.error) throw new Error(`org_members read failed: ${om.error.message}`);
  (om.data || []).forEach((r: any) => r?.org_id && orgs.add(String(r.org_id)));

  const arr = Array.from(orgs);
  if (arr.length === 0) throw new Error("No org membership found for user.");

  if (arr.length === 1) {
    const orgId = arr[0];
    const up = await admin.from("user_current_org").upsert(
      { user_id: userId, org_id: orgId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    if (up.error) throw new Error(`user_current_org upsert failed: ${up.error.message}`);
    return orgId;
  }

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
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anon) throw new Error("Missing SUPABASE_URL / SUPABASE_ANON_KEY");

    const bearer = extractBearer(req);
    if (!bearer) {
      return new Response(
        JSON.stringify({
          ok: false,
          build_tag: BUILD_TAG,
          error: "Missing Authorization Bearer token",
        }),
        { status: 401, headers: { ...C, "Content-Type": "application/json" } }
      );
    }

    // ✅ Universal: validar JWT dentro del handler (NO gateway)
    // getClaims verifica firma + exp y devuelve claims (sub = user id)
    const supabaseAuthClient = createClient(url, anon, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          // no es estrictamente necesario para getClaims, pero mantiene consistencia
          Authorization: bearer.authHeader,
          apikey: anon,
        },
      },
    });

    const { data: claimsData, error: claimsError } =
      await supabaseAuthClient.auth.getClaims(bearer.token);

    const userId = claimsData?.claims?.sub ? String(claimsData.claims.sub) : null;

    if (claimsError || !userId) {
      return new Response(
        JSON.stringify({
          ok: false,
          build_tag: BUILD_TAG,
          error: "Invalid JWT",
          diag: claimsError?.message || null,
        }),
        { status: 401, headers: { ...C, "Content-Type": "application/json" } }
      );
    }

    const body: Payload = await req.json();

    const lat = num(body.lat, "lat");
    const lng = num(body.lng, "lng");
    if (!isValidLatLng(lat, lng)) {
      return new Response(
        JSON.stringify({ ok: false, build_tag: BUILD_TAG, error: "Invalid lat/lng range" }),
        { status: 400, headers: { ...C, "Content-Type": "application/json" } }
      );
    }

    const recorded_at = parseRecordedAt(body);

    const admin = getAdminClient();
    const orgId = await resolveOrgIdServerOwned(admin, userId);

    const positionsTable = Deno.env.get("POSITIONS_TABLE") ?? "tracker_positions";

    const row: Record<string, unknown> = {
      org_id: orgId,
      user_id: userId,
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
    if (ins.error) {
      return new Response(
        JSON.stringify({
          ok: false,
          build_tag: BUILD_TAG,
          error: `Insert failed: ${ins.error.message}`,
        }),
        { status: 500, headers: { ...C, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        build_tag: BUILD_TAG,
        org_id: orgId,
        user_id: userId,
        recorded_at,
        table: positionsTable,
      }),
      { headers: { ...C, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = String((e as any)?.message || e);

    if (msg.includes("Multiple org memberships") || msg.includes("No org membership")) {
      return new Response(JSON.stringify({ ok: false, build_tag: BUILD_TAG, error: msg }), {
        status: 400,
        headers: { ...C, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, build_tag: BUILD_TAG, error: msg }), {
      status: 500,
      headers: { ...C, "Content-Type": "application/json" },
    });
  }
});