import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "missing_authorization" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const { org_id } = await req.json();

    if (!org_id || typeof org_id !== "string") {
      return new Response(JSON.stringify({ error: "org_id_required" }), {
        status: 400,
        headers: corsHeaders,
      });
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
      },
    );

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }

    const { data: memberData, error: memberError } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError || !memberData) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
    }

    const { data, error } = await supabase
      .from("org_billing")
      .select("paddle_subscription_id, billing_provider")
      .eq("org_id", org_id)
      .single();

    if (error || !data || data.billing_provider !== "paddle") {
      return new Response(JSON.stringify({ error: "no_paddle_subscription" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const subscriptionId = data.paddle_subscription_id;
    if (!subscriptionId) {
      return new Response(JSON.stringify({ error: "no_paddle_subscription" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const paddleApiBaseUrl =
      Deno.env.get("PADDLE_API_BASE_URL") || "https://sandbox-api.paddle.com";

    const res = await fetch(
      `${paddleApiBaseUrl}/subscriptions/${subscriptionId}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("PADDLE_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          effective_from: "next_billing_period",
        }),
      },
    );

    const result = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify(result), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
