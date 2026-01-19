import { corsHeaders, handleOptions } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  return new Response(
    JSON.stringify({ ok: true, name: "ping", ts: new Date().toISOString() }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
