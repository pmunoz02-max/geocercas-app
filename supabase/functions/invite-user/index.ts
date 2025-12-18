import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ===========================
   CORS
=========================== */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getBearerToken(req: Request): string | null {
  const auth =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/* ===========================
   MAIN
=========================== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const ctx: Record<string, unknown> = { stage: "start" };

  try {
    if (req.method !== "POST") {
      return jsonResponse(
        { ok: false, error: "Method Not Allowed", ctx },
        405
      );
    }

    /* ===========================
       ENV
    =========================== */
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const appUrl = Deno.env.get("APP_URL"); // OBLIGATORIA

    if (!url || !anonKey || !serviceKey || !appUrl) {
      return jsonResponse(
        {
          ok: false,
          error: "Missing env vars (SUPABASE_URL / ANON / SERVICE / APP_URL)",
          ctx,
        },
        500
      );
    }

    const token = getBearerToken(req);
    if (!token) {
      return jsonResponse(
        { ok: false, error: "Forbidden (no token)", ctx },
        403
      );
    }

    /* ===========================
       USER CLIENT (RLS)
    =========================== */
    const userClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user?.id) {
      return jsonResponse(
        { ok: false, error: "Unauthorized", ctx },
        401
      );
    }

    /* ===========================
       BODY
    =========================== */
    const body = await req.json().catch(() => null);

    const email: string = body?.email ?? "";
    const full_name: string | null = body?.full_name ?? null;
    const role_name: string = body?.role_name ?? "";
    const org_id: string | null = body?.org_id ?? null;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
    if (!emailRegex.test(email) || !role_name) {
      return jsonResponse(
        { ok: false, error: "Invalid email or role", ctx },
        422
      );
    }

    const roleNameNorm = String(role_name).toUpperCase();

    /* ===========================
       AUTHORIZATION
    =========================== */
    const { data: isRoot } = await userClient.rpc("is_root_owner");

    let isOrgAdmin = false;
    if (org_id) {
      const { data } = await userClient.rpc("is_org_admin", { p_org: org_id });
      isOrgAdmin = Boolean(data);
    }

    if (roleNameNorm === "OWNER" || roleNameNorm === "ADMIN") {
      if (!isRoot) {
        return jsonResponse(
          { ok: false, error: "Forbidden (root only)", ctx },
          403
        );
      }
    } else {
      if (!isRoot && !isOrgAdmin) {
        return jsonResponse(
          { ok: false, error: "Forbidden (org admin required)", ctx },
          403
        );
      }
    }

    /* ===========================
       ADMIN CLIENT
    =========================== */
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    /* ===========================
       INVITE USER
    =========================== */
    const redirectForTracker =
      roleNameNorm === "TRACKER" && org_id
        ? `${appUrl}/auth/callback?tracker_org_id=${org_id}`
        : `${appUrl}/auth/callback`;

    const { data: invitedData, error: invitedError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        data: {
          full_name,
          invited_role: roleNameNorm,
          tracker_org_id: roleNameNorm === "TRACKER" ? org_id : null,
        },
        options: {
          redirectTo: redirectForTracker,
        },
      });

    // Usuario ya existe → reenviar magic link
    if (invitedError?.message?.includes("already been registered")) {
      const publicClient = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      await publicClient.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirectForTracker,
        },
      });

      return jsonResponse({
        ok: true,
        mode: "magiclink_sent",
        email,
        role_planned: roleNameNorm,
        redirect: redirectForTracker,
      });
    }

    if (invitedError) {
      return jsonResponse(
        { ok: false, error: invitedError.message },
        500
      );
    }

    return jsonResponse({
      ok: true,
      mode: "invited",
      email,
      role_planned: roleNameNorm,
      redirect: redirectForTracker,
      invited: invitedData,
    });
  } catch (e: any) {
    console.error("[invite-user] fatal:", e);
    return jsonResponse(
      {
        ok: false,
        error: "Internal error",
        detail: String(e?.message ?? e),
      },
      500
    );
  }
});
