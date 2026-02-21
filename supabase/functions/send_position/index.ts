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
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
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
 * ✅ Resolver canónico (universal y consistente con Tracker Dashboard):
 * 1) tracker_assignments activos del usuario => org_id más reciente
 * 2) app_user_roles del usuario => org_id más reciente
 * 3) user_current_org (si existe) => org_id
 * 4) memberships + org_members (legacy)
 *
 * - Si en (4) encuentra exactamente 1 org => persiste en user_current_org
 * - Si en (4) hay 2+ orgs => ERROR (no adivina)
 */
async function resolveOrgIdServerOwned(
  admin: ReturnType<typeof getAdminClient>,
  userId: string
): Promise<string> {
  // 1) tracker_assignments activos (real para tracker)
  {
    const ta = await admin
      .from("tracker_assignments")
      .select("org_id, updated_at, created_at")
      .eq("tracker_user_id", userId)
      .eq("active", true)
      .not("org_id", "is", null)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // si tabla no existe / permisos, sigue; si hay otro error real, también seguimos como fallback universal
    if (!ta.error && ta.data?.org_id) return String(ta.data.org_id);
  }

  // 2) app_user_roles (real para tu preview / fuente de usuarios)
  {
    const aur = await admin
      .from("app_user_roles")
      .select("org_id, role, created_at")
      .eq("user_id", userId)
      .not("org_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!aur.error && aur.data?.org_id) return String(aur.data.org_id);
  }

  // 3) user_current_org (si existe)
  {
    const uco = await admin
      .from("user_current_org")
      .select("org_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!uco.error && uco.data?.org_id) return String(uco.data.org_id);
  }

  // 4) legacy: memberships + org_members
  const orgs = new Set<string>();

  const m = await admin.from("memberships").select("org_id").eq("user_id", userId);
  if (!m.error) (m.data || []).forEach((r: any) => r?.org_id && orgs.add(String(r.org_id)));

  const om = await admin.from("org_members").select("org_id").eq("user_id", userId);
  if (!om.error) (om.data || []).forEach((r: any) => r?.org_id && orgs.add(String(r.org_id)));

  const arr = Array.from(orgs);

  if (arr.length === 0) {
    throw new Error(
      "No org found for user (tracker_assignments/app_user_roles/user_current_org/memberships/org_members)."
    );
  }

  if (arr.length === 1) {
    const orgId = arr[0];
    // persistimos para que próximos envíos sean estables
    const up = await admin.from("user_current_org").upsert(
      { user_id: userId, org_id: orgId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    // si falla persistencia no bloquea el envío (pero lo reportamos en logs del error si quieres)
    if (up.error) {
      // no lanzamos, solo dejamos pasar: preferimos no perder posiciones
    }
    return orgId;
  }

  throw new Error(
    `Multiple org memberships found for user. Please set current org (set_current_org) before sending positions. orgs=${arr.join(
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
    if (!isValidLatLng(lat, lng)) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid lat/lng range" }), {
        status: 400,
        headers: { ...C, "Content-Type": "application/json" },
      });
    }

    const recorded_at = parseRecordedAt(body);

    const admin = getAdminClient();
    const orgId = await resolveOrgIdServerOwned(admin, user.id);

    // ✅ CANÓNICO por defecto
    const positionsTable = Deno.env.get("POSITIONS_TABLE") ?? "tracker_positions";

    const row: Record<string, unknown> = {
      org_id: orgId, // ✅ SERVER-OWNED (consistente con dashboard)
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
    if (ins.error) {
      return new Response(JSON.stringify({ ok: false, error: `Insert failed: ${ins.error.message}` }), {
        status: 500,
        headers: { ...C, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        org_id: orgId,
        recorded_at,
        table: positionsTable,
      }),
      { headers: { ...C, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = String(e?.message || e);

    if (msg.includes("Multiple org memberships") || msg.includes("No org found")) {
      return new Response(JSON.stringify({ ok: false, error: msg }), {
        status: 400,
        headers: { ...C, "Content-Type": "application/json" },
      });
    }

    if (msg.includes("Missing Authorization") || msg.includes("Auth user lookup failed")) {
      return new Response(JSON.stringify({ ok: false, error: msg }), {
        status: 401,
        headers: { ...C, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...C, "Content-Type": "application/json" },
    });
  }
});