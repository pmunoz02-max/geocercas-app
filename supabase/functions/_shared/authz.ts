// supabase/functions/_shared/authz.ts
import { getAdminClient, getSupabaseUrl } from "./supabaseAdmin.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * HttpError para devolver status correcto (401/403/400/500) de forma universal.
 */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getBearer(req: Request) {
  const h = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || "";
}

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const json = atob(b64 + pad);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function expectedProjectRefFromUrl(url: string) {
  // https://<ref>.supabase.co
  try {
    const u = new URL(url);
    const host = u.hostname || "";
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m?.[1] || "";
  } catch {
    return "";
  }
}

function env(name: string, fallback?: string) {
  const v = Deno.env.get(name) ?? fallback;
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * ✅ UNIVERSAL (REALMENTE UNIVERSAL):
 * - Requiere Authorization Bearer
 * - Valida SIEMPRE contra el MISMO proyecto de la Edge Function:
 *   usando SUPABASE_URL + SUPABASE_ANON_KEY del runtime
 * - No depende de getUserClient(req)
 * - No hace validación manual de firma/JWT secret
 */
export async function requireUser(req: Request) {
  const jwt = getBearer(req);
  if (!jwt) throw new HttpError(401, "Missing Authorization Bearer token");

  // Diagnóstico permanente: mismatch preview/prod (si el token trae claim ref)
  const payload = decodeJwtPayload(jwt);
  const expectedRef = expectedProjectRefFromUrl(getSupabaseUrl());
  const tokenRef = payload?.ref ? String(payload.ref) : "";
  if (expectedRef && tokenRef && expectedRef !== tokenRef) {
    throw new HttpError(
      401,
      `Invalid JWT: project mismatch (expected ${expectedRef}, got ${tokenRef})`,
    );
  }

  // ✅ Validación estable con GoTrue del MISMO proyecto (sin header-magic)
  const SUPABASE_URL = env("SUPABASE_URL", getSupabaseUrl());
  const SUPABASE_ANON_KEY = env("SUPABASE_ANON_KEY");

  const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await supa.auth.getUser(jwt);
  if (error || !data?.user) throw new HttpError(401, "Invalid JWT");

  return data.user;
}

/**
 * ✅ UNIVERSAL MULTI-TENANT:
 * Requiere que el usuario sea admin/owner EN ESA ORG.
 */
export async function requireOrgAdmin(req: Request, orgId: string) {
  const user = await requireUser(req);
  const org_id = String(orgId || "").trim();
  if (!org_id) throw new HttpError(400, "org_id required");

  // Aquí puedes usar user-scoped query, pero para no depender de getUserClient(req),
  // lo hacemos con anon+token y RLS (si tu RLS lo permite).
  const SUPABASE_URL = env("SUPABASE_URL", getSupabaseUrl());
  const SUPABASE_ANON_KEY = env("SUPABASE_ANON_KEY");
  const jwt = getBearer(req);

  const supaUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data, error } = await supaUser
    .from("memberships")
    .select("role")
    .eq("org_id", org_id)
    .eq("user_id", user.id)
    .limit(1);

  if (error) throw new HttpError(403, "Forbidden");
  const role = data?.[0]?.role ? String(data[0].role) : "";
  if (!["admin", "owner"].includes(role)) throw new HttpError(403, "Forbidden");

  return { user, role };
}

/**
 * Compatibilidad: requireRole(role) global via user_roles.
 */
export async function requireRole(req: Request, role: string) {
  const user = await requireUser(req);

  const requireRoleFlag =
    (Deno.env.get("REQUIRE_ROLE") ?? "true").toLowerCase() === "true";
  if (!requireRoleFlag) return user;

  const supabase = getAdminClient();
  const table = Deno.env.get("USER_ROLES_TABLE") ?? "user_roles";

  const { data, error } = await supabase
    .from(table)
    .select("role")
    .eq("user_id", user.id)
    .limit(50);

  if (error) throw new HttpError(403, `Role check failed: ${error.message}`);
  const roles = new Set((data ?? []).map((r: any) => String(r.role)));
  if (!roles.has(role)) throw new HttpError(403, "Forbidden");

  return user;
}
