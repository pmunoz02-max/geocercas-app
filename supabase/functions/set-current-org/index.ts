import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    // ✅ AUTH CORRECTO

    const authHeader = req.headers.get("Authorization");

    // Log auth header presence and prefix
    console.log(JSON.stringify({
      scope: "set-current-org",
      step: "auth_header_received",
      hasAuthHeader: !!authHeader,
      authHeaderPrefix: authHeader ? authHeader.slice(0, 30) : null,
    }));

    if (!authHeader) {
      return json(401, { error: "Missing Authorization header" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    // Log getUser result
    console.log(JSON.stringify({
      scope: "set-current-org",
      step: "get_user_result",
      hasUser: !!user,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      userErrorMessage: userError?.message ?? null,
      userErrorStatus: userError?.status ?? null,
      userErrorName: userError?.name ?? null,
    }));

    if (userError || !user) {
      return json(401, {
        error: "Invalid user",
        debug: {
          hasAuthHeader: !!authHeader,
          authHeaderPrefix: authHeader ? authHeader.slice(0, 30) : null,
          userErrorMessage: userError?.message ?? null,
          userErrorStatus: userError?.status ?? null,
          userErrorName: userError?.name ?? null,
          hasUser: !!user,
        },
      });
    }

    // --- BODY ---
    const body = await req.json().catch(() => ({}));
    const orgId =
      typeof body?.org_id === "string" ? body.org_id.trim() : "";

    if (!orgId) {
      return json(400, { error: "org_id is required" });
    }

    // --- ADMIN CLIENT ---
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // --- VALIDAR MEMBERSHIP ---
    const { data: isMember, error: memberError } = await adminClient.rpc(
      "gc_is_member_of_org",
      {
        p_user_id: user.id,
        p_org_id: orgId,
      }
    );

    if (memberError) {
      return json(500, { error: "Membership check failed" });
    }

    if (!isMember) {
      return json(403, { error: "User not part of org" });
    }

    // --- SAVE CURRENT ORG ---
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      user.id,
      {
        user_metadata: {
          current_org_id: orgId,
        },
      }
    );

    if (updateError) {
      return json(500, { error: "Failed to set org in metadata" });
    }

    return json(200, {
      success: true,
      org_id: orgId,
    });
  } catch (err) {
    return json(500, {
      error: "Unexpected error",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});