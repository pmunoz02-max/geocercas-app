import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function json(status: number, obj: unknown) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function hmacHex(secret: string, msg: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  const build_tag = "accept-tracker-invite-v7_hmac_nojwt_20260224";

  try {
    if (req.method === "OPTIONS") return json(200, { ok: true, build_tag });

    if (req.method !== "POST") {
      return json(405, { ok: false, build_tag, error: "METHOD_NOT_ALLOWED" });
    }

    // ✅ Secrets (recuerda: Supabase no permite SUPABASE_*)
    const SB_URL = Deno.env.get("SB_URL");
    const SB_SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE");
    const TRACKER_PROXY_SECRET = Deno.env.get("TRACKER_PROXY_SECRET");

    if (!SB_URL || !SB_SERVICE_ROLE || !TRACKER_PROXY_SECRET) {
      return json(500, {
        ok: false,
        build_tag,
        error: "Missing env",
        diag: {
          hasSbUrl: !!SB_URL,
          hasSbServiceRole: !!SB_SERVICE_ROLE,
          hasTrackerProxySecret: !!TRACKER_PROXY_SECRET,
        },
      });
    }

    // ✅ Validate proxy signature (same pattern as send_position)
    const ts = req.headers.get("X-Proxy-Ts") || "";
    const signature = req.headers.get("X-Proxy-Signature") || "";

    const rawBody = await req.text(); // exact bytes as received
    const fn = "accept-tracker-invite";

    const expected = await hmacHex(TRACKER_PROXY_SECRET, `${fn}.${ts}.${rawBody}`);

    if (!ts || !signature || expected !== signature) {
      return json(401, {
        ok: false,
        build_tag,
        error: "Invalid proxy signature",
      });
    }

    let body: any = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      body = {};
    }

    const org_id = body?.org_id;
    const user_id = body?.user_id; // recomendado: mandar user_id
    const email = body?.email;     // fallback si mandas email

    if (!org_id) return json(400, { ok: false, build_tag, error: "Missing org_id" });

    const admin = createClient(SB_URL, SB_SERVICE_ROLE);

    let resolvedUserId = user_id;

    // Fallback: si no hay user_id, intentamos resolver por email en profiles (si tu modelo lo permite)
    if (!resolvedUserId && email) {
      const { data, error } = await admin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (error) {
        return json(500, { ok: false, build_tag, error: "Resolve user by email failed", detail: error.message });
      }
      resolvedUserId = data?.id;
    }

    if (!resolvedUserId) {
      return json(400, { ok: false, build_tag, error: "Missing user_id (or email not found)" });
    }

    // ✅ Upsert membership tracker
    const { error: upsertErr } = await admin
      .from("user_organizations")
      .upsert(
        { user_id: resolvedUserId, org_id, role: "tracker" },
        { onConflict: "user_id,org_id" },
      );

    if (upsertErr) {
      return json(500, { ok: false, build_tag, error: "Upsert failed", detail: upsertErr.message });
    }

    return json(200, { ok: true, build_tag, user_id: resolvedUserId, org_id });
  } catch (e) {
    return json(500, { ok: false, build_tag: "accept-tracker-invite-v7_hmac_nojwt_20260224", error: String((e as any)?.message ?? e) });
  }
});