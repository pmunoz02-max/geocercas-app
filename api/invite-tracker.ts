// api/invite-tracker.ts
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

const BUILD_TAG = "invite-tracker-v4-redirect-next-tracker";
const DEFAULT_APP_URL = "https://app.tugeocercas.com";

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function isTruthy(x: any) {
  return x === true || x === "true" || x === 1 || x === "1";
}

function getBearer(req: any) {
  const h = req?.headers?.authorization || req?.headers?.Authorization || "";
  const s = String(h || "").trim();
  const m = s.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || "";
}

function json(res: any, status: number, payload: any) {
  return res.status(status).json({ build_tag: BUILD_TAG, ...payload });
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json(res, 500, {
        ok: false,
        error: "Missing env vars (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const email = normalizeEmail(body.email);
    const org_id = String(body.org_id || "").trim();
    const person_id = String(body.person_id || "").trim(); // opcional, pero lo recibimos
    const forceTrackerDefault = isTruthy(body.force_tracker_default); // opcional (tu caso)
    const onlyIfNoDefault = isTruthy(body.only_if_no_default ?? true); // por defecto: NO rompe defaults existentes

    if (!email || !email.includes("@")) return json(res, 400, { ok: false, error: "Email inválido" });
    if (!org_id) return json(res, 400, { ok: false, error: "org_id requerido" });

    // =========================
    // 1) Validar quién está invitando (Bearer token)
    // =========================
    const accessToken = getBearer(req);
    if (!accessToken) return json(res, 401, { ok: false, error: "No autenticado (falta Authorization: Bearer ...)" });

    const sbUser = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: uData, error: uErr } = await sbUser.auth.getUser();
    const inviter = uData?.user;
    if (uErr || !inviter?.id) return json(res, 401, { ok: false, error: "Sesión inválida" });

    // =========================
    // 2) Service client (DB + admin ops)
    // =========================
    const sbAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // 2.1) Verificar permisos del invitador en esa org
    const { data: inviterMem, error: memErr } = await sbAdmin
      .from("memberships")
      .select("role")
      .eq("user_id", inviter.id)
      .eq("org_id", org_id)
      .maybeSingle();

    if (memErr) return json(res, 500, { ok: false, error: "No se pudo validar permisos", details: memErr.message });

    const inviterRole = String(inviterMem?.role || "").toLowerCase();
    const canInvite = inviterRole === "owner" || inviterRole === "admin" || inviterRole === "root" || inviterRole === "root_owner";
    if (!canInvite) return json(res, 403, { ok: false, error: "Sin permisos para invitar tracker" });

    // =========================
    // 3) Encontrar usuario por email (o crearlo)
    // =========================
    // Nota: listUsers({ email }) funciona, pero retorna lista; filtramos exacto.
    const { data: usersResp, error: listErr } = await sbAdmin.auth.admin.listUsers({ email });
    if (listErr) return json(res, 500, { ok: false, error: "No se pudo listar usuarios", details: listErr.message });

    let userId: string | null = usersResp?.users?.find((u: any) => String(u.email || "").toLowerCase() === email)?.id || null;

    if (!userId) {
      const { data: created, error: createErr } = await sbAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (createErr) return json(res, 500, { ok: false, error: "No se pudo crear usuario", details: createErr.message });
      userId = created?.user?.id || null;
    }

    if (!userId) return json(res, 500, { ok: false, error: "No se pudo determinar user_id" });

    // =========================
    // 4) Decidir si tracker debe ser default
    // =========================
    // Regla segura:
    // - Si force_tracker_default=true => tracker será default (y apagamos otros defaults)
    // - Si only_if_no_default=true => tracker será default solo si NO hay ningún default existente
    // - Si only_if_no_default=false => tracker siempre será default (equivalente a force)
    let shouldSetDefault = false;

    const { data: existingDefaults, error: defErr } = await sbAdmin
      .from("memberships")
      .select("org_id, role, is_default")
      .eq("user_id", userId)
      .eq("is_default", true);

    if (defErr) return json(res, 500, { ok: false, error: "No se pudo leer defaults", details: defErr.message });

    const hasAnyDefault = Array.isArray(existingDefaults) && existingDefaults.length > 0;

    if (forceTrackerDefault) shouldSetDefault = true;
    else if (!onlyIfNoDefault) shouldSetDefault = true;
    else shouldSetDefault = !hasAnyDefault;

    // =========================
    // 5) Upsert membership tracker en la org
    // =========================
    const { error: upErr } = await sbAdmin
      .from("memberships")
      .upsert(
        { org_id, user_id: userId, role: "tracker", is_default: shouldSetDefault },
        { onConflict: "org_id,user_id" }
      );

    if (upErr) return json(res, 500, { ok: false, error: "No se pudo asignar rol tracker", details: upErr.message });

    // 5.1) Si será default, apagar otros defaults del usuario
    if (shouldSetDefault) {
      const { error: offErr } = await sbAdmin
        .from("memberships")
        .update({ is_default: false })
        .eq("user_id", userId)
        .neq("org_id", org_id)
        .eq("is_default", true);

      if (offErr) return json(res, 500, { ok: false, error: "No se pudo ajustar default", details: offErr.message });

      // También alinear profiles (por si get_my_context usa ensure_active_org_for_user)
      await sbAdmin
        .from("profiles")
        .update({ current_org_id: org_id, default_org_id: org_id })
        .eq("user_id", userId);
    }

    // =========================
    // 6) Enviar magic link: auth/callback?next=/tracker-gps&org_id=...
    // =========================
    const appUrl = (process.env.APP_URL || DEFAULT_APP_URL).trim();
    const redirectTo =
      `${appUrl}/auth/callback?next=${encodeURIComponent("/tracker-gps")}` +
      `&org_id=${encodeURIComponent(org_id)}`;

    const sbAnon = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { error: otpErr } = await sbAnon.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: false,
      },
    });

    if (otpErr) return json(res, 500, { ok: false, error: "No se pudo enviar el enlace", details: otpErr.message });

    return json(res, 200, {
      ok: true,
      invited_email: email,
      user_id: userId,
      org_id,
      person_id: person_id || null,
      tracker_default: shouldSetDefault,
      redirect_to: redirectTo,
    });
  } catch (e: any) {
    console.error("[api/invite-tracker] error:", e);
    return json(res, 500, { ok: false, error: String(e?.message || e) });
  }
}
