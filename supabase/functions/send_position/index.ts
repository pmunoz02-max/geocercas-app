import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

serve(async (req) => {
  const build_tag = "send_position-v7_hmac_stable_20260224"

  try {
    const SB_URL = Deno.env.get("SB_URL")
    const SB_SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE")
    const TRACKER_PROXY_SECRET = Deno.env.get("TRACKER_PROXY_SECRET")

    if (!SB_URL || !SB_SERVICE_ROLE || !TRACKER_PROXY_SECRET) {
      return new Response(
        JSON.stringify({
          ok: false,
          build_tag,
          error: "Missing required env vars"
        }),
        { status: 500 }
      )
    }

    const ts = req.headers.get("X-Proxy-Ts")
    const signature = req.headers.get("X-Proxy-Signature")
    const fn = "send_position"

    const rawBody = await req.text()

    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(TRACKER_PROXY_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    )

    const data = encoder.encode(`${fn}.${ts}.${rawBody}`)
    const sigBuf = await crypto.subtle.sign("HMAC", key, data)
    const expected = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")

    if (expected !== signature) {
      return new Response(
        JSON.stringify({
          ok: false,
          build_tag,
          error: "Invalid proxy signature"
        }),
        { status: 401 }
      )
    }

    const body = JSON.parse(rawBody)
    const { user_id, org_id, lat, lng } = body

    const admin = createClient(SB_URL, SB_SERVICE_ROLE)

    const { error } = await admin.from("positions").insert({
      user_id,
      org_id,
      lat,
      lng
    })

    if (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          build_tag,
          error: error.message
        }),
        { status: 500 }
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        build_tag
      }),
      { status: 200 }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        ok: false,
        build_tag,
        error: err.message
      }),
      { status: 500 }
    )
  }
})