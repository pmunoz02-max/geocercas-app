import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Dominio canonical del panel (sin slash final)
const APP_URL = (Deno.env.get("APP_URL") || "https://www.tugeocercas.com").replace(
  /\/+$/,
  ""
);

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(status: number, step: string, message: string, details?: unknown) {
  return json(status, { ok: false, step, message, details: details ?? null });
}

function jsonOk(payload: unknown) {
  return json(200, { ok: true, ...payload });
}

function normRole(role: unknown): "owner" | "admin" {
  const r = String(role || "").toLowerCase().trim();
  return r === "admin" ? "admin" : "owner";
}

function normEmail(email: unknown): string {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Redirect universal del panel (tu callback ya maneja verifyOtp).
 */
function buildRedirectTo(): string {
  return `${APP_URL}/auth/callback?target=panel`;
}

/**
 * Cliente admin (service role)
 */
function createAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Lookup universal de usuario por email (porque getUserByEmail NO existe aquí).
 * Usa listUsers + filtro exacto por email.
 * - Maneja paginación de forma segura (hasta maxPages).
 */
async function findUserIdByEmail(params: {
  supabaseAdmin: any;
  email: string;
  perPage?: number;
  maxPages?: number;
}): Promise<{ userId: string | null; debug: any }> {
  const { supabaseAdmin, email } = params;
  const perPage = params.perPage ?? 200;
  const maxPages = params.maxPages ?? 20;

  const emailLc = email.toLowerCase().trim();

  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      return {
        userId: null,
        debug: { step: "list_users_error", page, perPage, error },
      };
    }

    const users = (data as any)?.users ?? [];
    const match = users.find((u: any) => String(u?.email || "").toLowerCase() === emailLc);

    if (match?.id) {
      return { userId: match.id, debug: { step: "found", page, perPage } };
    }

    // Si la página vino con menos de perPage, ya no hay más
    if (!users.length || users.length < perPage) {
      break;
    }
  }

  return { userId: null, debug: { step: "not_found" } };
}

/**
 * Regla de permisos (app_user_roles):
 * - Para invitar ADMIN a una org: invitador debe ser OWNER en esa org_id
 * - Para invitar OWNER independiente: invitador debe ser OWNER en al menos una org
 */
async function checkInviterPermissions(params: {
  supabaseAdmin: any;
  inviterId: string;
  requestedRole: "owner" | "admin";
  targetOrgId: string | null;
}) {
  const { supabaseAdmin, inviterId, requestedRole, targetOrgId } = params;

  if (requestedRole === "admin") {
    if (!targetOrgId) {
      return {
        ok: false,
        status: 400,
        step: "perm_org_id",
        message: "Para invitar ADMIN debes enviar org_id (org existente).",
        details: null,
      };
    }

    const { data, error } = await supabaseAdmin
      .from("app_user_roles")
      .select("org_id, role")
      .eq("user_id", inviterId)
      .eq("org_id", targetOrgId)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        status: 500,
        step: "perm_check_owner_org",
        message: "Error verificando permisos del invitador (owner en org)",
        details: error,
      };
    }

    if (!data) {
      return {
        ok: false,
        status: 403,
        step: "perm_forbidden",
        message: "Forbidden: solo owners de esa organización pueden invitar admins.",
        details: { inviterId, targetOrgId },
      };
    }

    return { ok: true as const };
  }

  // requestedRole === "owner": basta ser owner en al menos una org
  const { data, error } = await supabaseAdmin
    .from("app_user_roles")
    .select("org_id, role")
    .eq("user_id", inviterId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      step: "perm_check_owner_any",
      message: "Error verificando permisos del invitador (owner en alguna org)",
      details: error,
    };
  }

  if (!data) {
    return {
      ok: false,
      status: 403,
      step: "perm_forbidden",
      message: "Forbidden: solo owners pueden invitar owners independientes.",
      details: { inviterId },
    };
  }

  return { ok: true as const };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "method", "Method not allowed");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError(500, "env", "Missing required environment variables", {
      SUPABASE_URL: !!SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!SUPABASE_SERVICE_ROLE_KEY,
      hint: "Configura SUPABASE_SERVICE_ROLE_KEY como Secret en Supabase Edge Functions.",
    });
  }

  try {
    // 0) Token del invitador
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonError(401, "auth_header", "Missing or invalid Authorization header");
    }
    const token = authHeader.slice("bearer ".length).trim();
    if (!token) return jsonError(401, "auth_token", "Missing bearer token");

    // 1) Admin client
    const supabaseAdmin = createAdminClient();

    // 2) Identificar invitador usando el JWT
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    const inviter = userData?.user ?? null;

    if (userError || !inviter) {
      return jsonError(401, "auth_get_user", "Not authenticated", userError ?? null);
    }

    // 3) Parse body
    const body = await req.json().catch(() => null);
    const email = normEmail(body?.email);
    const role = normRole(body?.role);
    const targetOrgId = body?.org_id ? String(body.org_id) : null;
    const orgName = body?.org_name ? String(body.org_name).trim() : email;

    if (!email || !isValidEmail(email)) {
      return jsonError(
        400,
        "body",
        "Invalid body: { email: string, role?: 'admin'|'owner', org_id?: string }",
        { received: body }
      );
    }

    // 4) Permisos
    const perm = await checkInviterPermissions({
      supabaseAdmin,
      inviterId: inviter.id,
      requestedRole: role,
      targetOrgId,
    });

    if (!perm.ok) return jsonError(perm.status, perm.step, perm.message, perm.details);

    // 5) Get or create user by email (sin getUserByEmail)
    let newUserId: string | null = null;

    const found = await findUserIdByEmail({ supabaseAdmin, email });
    if (found.userId) {
      newUserId = found.userId;
    } else {
      const { data: created, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: false,
        });

      if (createError) {
        return jsonError(500, "create_user", "Error creando usuario", createError);
      }
      newUserId = created.user?.id ?? null;
    }

    if (!newUserId) {
      return jsonError(500, "user_id", "No se pudo obtener user_id del invitado", {
        find_debug: found.debug,
      });
    }

    /**
     * 6) Determinar org destino:
     * - Si role=admin: usa org_id enviada (org existente del invitador)
     * - Si role=owner: crea org NUEVA para el invitado (owner independiente)
     */
    let finalOrgId: string | null = null;
    let createdOrg = false;

    if (role === "admin") {
      finalOrgId = targetOrgId!;
    } else {
      const { data: existingOrg, error: existingOrgError } = await supabaseAdmin
        .from("organizations")
        .select("id, plan")
        .eq("owner_id", newUserId)
        .limit(1)
        .maybeSingle();

      if (existingOrgError) {
        return jsonError(500, "org_lookup", "Error buscando org del nuevo owner", existingOrgError);
      }

      if (existingOrg?.id) {
        finalOrgId = existingOrg.id;
      } else {
        const { data: newOrg, error: newOrgError } = await supabaseAdmin
          .from("organizations")
          .insert({
            name: orgName,
            owner_id: newUserId,
            created_by: inviter.id,
            active: true,
          })
          .select("id")
          .single();

        if (newOrgError) {
          return jsonError(500, "org_create", "Error creando organización del nuevo owner", {
            error: newOrgError,
            attempted: { name: orgName, owner_id: newUserId, created_by: inviter.id, active: true },
          });
        }

        finalOrgId = newOrg.id;
        createdOrg = true;
      }
    }

    if (!finalOrgId) {
      return jsonError(500, "org_id", "No se pudo determinar org_id final para el invitado");
    }

    // 7) Insert rol (idempotente)
    const { error: roleInsertError } = await supabaseAdmin
      .from("app_user_roles")
      .insert({
        user_id: newUserId,
        org_id: finalOrgId,
        role,
      });

    if (roleInsertError && roleInsertError.code !== "23505") {
      return jsonError(500, "role_insert", "Error creando rol", roleInsertError);
    }

    // 8) Bootstrap BEST-EFFORT
    let bootstrap_status: "ok" | "skipped" | "failed" = "skipped";
    let bootstrap_error: unknown = null;

    const { error: bootstrapError } = await supabaseAdmin.rpc("ensure_admin_bootstrap", {
      p_email: email,
    });

    if (bootstrapError) {
      bootstrap_status = "failed";
      bootstrap_error = bootstrapError;
      console.log("[invite_admin] bootstrap failed (continuing)", bootstrapError);
    } else {
      bootstrap_status = "ok";
    }

    // 9) Invite email
    const redirectTo = buildRedirectTo();

    let invitedVia: "email" | "action_link" = "email";
    let actionLink: string | null = null;

    const { data: inviteData, error: inviteErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo });

    if (inviteErr) {
      console.log("[invite_admin] inviteUserByEmail fail, fallback generateLink", inviteErr);
      invitedVia = "action_link";

      const { data: linkData, error: linkError } =
        await supabaseAdmin.auth.admin.generateLink({
          type: "invite",
          email,
          options: { redirectTo },
        });

      if (linkError) {
        return jsonError(500, "generate_link", "No se pudo enviar correo ni generar link", {
          inviteErr,
          linkError,
          bootstrap_status,
          bootstrap_error,
        });
      }

      actionLink = (linkData as any)?.properties?.action_link ?? null;
    } else {
      actionLink = (inviteData as any)?.properties?.action_link ?? null;
    }

    return jsonOk({
      invited_email: email,
      role,
      new_user_id: newUserId,
      org_id: finalOrgId,
      created_org: createdOrg,
      invited_via: invitedVia,
      redirect_to: redirectTo,
      action_link: actionLink,
      bootstrap_status,
      bootstrap_error,
    });
  } catch (err: any) {
    console.log("[invite_admin] unhandled exception", err);
    return jsonError(500, "unhandled", "Internal server error", {
      message: String(err?.message || err),
      stack: String(err?.stack || ""),
    });
  }
});