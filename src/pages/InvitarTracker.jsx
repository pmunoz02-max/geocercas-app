import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";
import { requireRole } from "../_shared/authz.ts";

type Payload = {
  email?: string;
  org_id?: string;
  person_id?: string;
  resend?: boolean;

  // retrocompatibilidad
  orgId?: string;
  personId?: string;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAnyRole(req: Request, roles: string[]) {
  let last: any = null;
  for (const r of roles) {
    try {
      await requireRole(req, r);
      return;
    } catch (e) {
      last = e;
    }
  }
  throw last ?? new Error("forbidden");
}

const normEmail = (v: string) => String(v || "").trim().toLowerCase();

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    // ✅ Acepta owner/admin/root (sin degradar nada)
    await requireAnyRole(req, ["owner", "admin", "root"]);

    const body: Payload = await req.json().catch(() => ({} as Payload));

    const email = normEmail(body.email || "");
    const org_id = String(body.org_id || body.orgId || "").trim();
    const person_id = String(body.person_id || body.personId || "").trim();
    const resend = Boolean(body.resend ?? false);

    if (!email) return json(400, { ok: false, code: "EMAIL_REQUIRED", message: "email required" });
    if (!org_id) return json(400, { ok: false, code: "ORG_ID_REQUIRED", message: "org_id required" });
    if (!person_id) return json(400, { ok: false, code: "PERSON_ID_REQUIRED", message: "person_id required" });

    const redirectTo = Deno.env.get("INVITE_REDIRECT_TO") || "";

    const supabase = getAdminClient();

    // ✅ Validación contractual: la invitación debe estar ligada a Personal (y en la misma org)
    const { data: person, error: pErr } = await supabase
      .from("personal")
      .select("id, org_id, email, is_deleted, vigente")
      .eq("id", person_id)
      .eq("org_id", org_id)
      .maybeSingle();

    if (pErr) return json(500, { ok: false, code: "PERSON_LOOKUP_ERROR", message: pErr.message });
    if (!person) return json(400, { ok: false, code: "PERSON_NOT_IN_ORG", message: "person_id not found in org" });
    if (person.is_deleted === true) return json(400, { ok: false, code: "PERSON_DELETED", message: "personal deleted" });
    if (typeof person.vigente === "boolean" && person.vigente === false) {
      return json(400, { ok: false, code: "PERSON_INACTIVE", message: "personal not active" });
    }

    // ✅ Si usuario existe -> magiclink (sirve para resend)
    // ✅ Si no existe -> invite
    const { data: uData, error: uErr } = await supabase.auth.admin.getUserByEmail(email);
    if (uErr) return json(500, { ok: false, code: "AUTH_LOOKUP_ERROR", message: uErr.message });

    const exists = Boolean(uData?.user?.id);
    const type = exists ? "magiclink" : "invite";

    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: type as any,
      email,
      options: redirectTo ? { redirectTo } : undefined,
    });

    if (linkErr) return json(400, { ok: false, code: "LINK_ERROR", message: linkErr.message });

    const action_link = (linkData?.properties as any)?.action_link ?? null;
    const user_id = linkData?.user?.id ?? uData?.user?.id ?? null;

    return json(200, {
      ok: true,
      invited: true,
      resend,
      exists,
      email,
      org_id,
      person_id,
      user_id,
      action_link, // útil para debug; luego lo ocultamos si quieres
    });
  } catch (e) {
    const msg = String((e as any)?.message || e);
    const forbidden = msg.toLowerCase().includes("forbidden") || msg.toLowerCase().includes("unauthorized");
    return json(forbidden ? 403 : 400, {
      ok: false,
      code: forbidden ? "FORBIDDEN" : "BAD_REQUEST",
      message: msg,
    });
  }
});
