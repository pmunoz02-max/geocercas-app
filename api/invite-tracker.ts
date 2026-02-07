// api/invite-tracker.ts
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// ✅ Canonical resolver (server-side org + membership)
import { resolveOrgAndMembership } from "../src/server/lib/resolveOrg.js";

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_ANON_KEY!;

// Puede venir vacío en algunos deploys; lo resolvemos con fallback desde headers.
const PUBLIC_SITE_URL_ENV = (process.env.PUBLIC_SITE_URL || "").replace(/\/+$/, "");

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const supabaseAnon = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function normEmail(v: any) {
  return String(v || "").trim().toLowerCase();
}

function toBool(v: any, def = false) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return def;
}

function safePathOrDefault(v: any, def: string) {
  const s = String(v || "").trim();
  if (!s) return def;
  if (!s.startsWith("/")) return def;
  if (s.startsWith("//")) return def;
  return s;
}

/* ------------------------------------------------------------------ */
/* SITE URL (robusto) */
/* ------------------------------------------------------------------ */

function getPublicSiteUrl(req: VercelRequest) {
  if (PUBLIC_SITE_URL_ENV) return PUBLIC_SITE_URL_ENV;

  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();

  if (!host) return "";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

/* ------------------------------------------------------------------ */
/* AUTH USERS: find/create by email */
/* ------------------------------------------------------------------ */

// ✅ Preferir getUserByEmail si existe; fallback a listUsers paginado
async function findUserIdByEmail(email: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyAdmin: any = supabaseAdmin.auth.admin as any;
    if (typeof anyAdmin.getUserByEmail === "function") {
      const { data, error } = await anyAdmin.getUserByEmail(email);
      if (error) throw error;
      if (data?.user?.id) return String(data.user.id);
    }
  } catch {
    // seguimos
  }

  let page = 1;
  const perPage = 200;

  for (let i = 0; i < 30; i++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    const hit = users.find((u: any) => normEmail(u.email) === email);
    if (hit?.id) return String(hit.id);

    if (users.length < perPage) break;
    page++;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* MEMBERSHIPS: única fuente de verdad */
/* ------------------------------------------------------------------ */

function isIncompatibleRole(role: string) {
  const r = String(role || "").toLowerCase();
  // “incompatible” = roles con más privilegio o distinto propósito
  return r === "owner" || r === "admin" || r === "root" || r === "root_owner";
}

/**
 * Regla:
 * - Si ya es tracker en esa org => OK
 * - Si es owner/admin/root => FORBIDDEN (no degradamos)
 * - Si es viewer/otro => si force_swap=true, se actualiza a tracker; si no, error
 */
async function ensureTrackerMembership(params: {
  user_id: string;
  org_id: string;
  inviter_user_id: string;
  force_swap: boolean;
}) {
  const { user_id, org_id, inviter_user_id, force_swap } = params;

  const { data: existing, error } = await supabaseAdmin
    .from("memberships")
    .select("id, role")
    .eq("user_id", user_id)
    .eq("org_id", org_id)
    .maybeSingle();

  if (error) throw error;

  const existingRole = String(existing?.role || "").toLowerCase();

  if (existing?.id) {
    if (existingRole === "tracker") return;

    if (isIncompatibleRole(existingRole)) {
      throw new Error("Forbidden: invited user already has incompatible role in this org");
    }

    if (!force_swap) {
      throw new Error("Forbidden: invited user already belongs to this org with a different role (set force_swap=1)");
    }

    const { error: updErr } = await supabaseAdmin
      .from("memberships")
      .update({
        role: "tracker",
        updated_at: new Date().toISOString(),
        updated_by: inviter_user_id,
      })
      .eq("id", existing.id);

    if (updErr) throw updErr;
    return;
  }

  // No existe membership aún => insertar tracker
  const { error: insErr } = await supabaseAdmin.from("memberships").insert({
    user_id,
    org_id,
    role: "tracker",
    created_at: new Date().toISOString(),
    created_by: inviter_user_id,
    updated_at: new Date().toISOString(),
    updated_by: inviter_user_id,
    // is_default: false (si existe). No lo ponemos para no fallar si no existe la columna.
  });

  if (insErr) {
    // Si falla por columnas audit inexistentes, reintenta mínimo
    if (/column .* does not exist/i.test(String(insErr.message || ""))) {
      const { error: insErr2 } = await supabaseAdmin.from("memberships").insert({
        user_id,
        org_id,
        role: "tracker",
      });
      if (insErr2) throw insErr2;
      return;
    }
    throw insErr;
  }
}

/* ------------------------------------------------------------------ */
/* INVITES: tracker_invites */
/* ------------------------------------------------------------------ */

async function getOrCreateActiveInvite(params: {
  org_id: string;
  email: string;
  inviter_user_id: string;
  invited_user_id: string;
  expires_days?: number;
  mode?: "invite" | "resend";
}) {
  const { org_id, email, inviter_user_id, invited_user_id } = params;
  const expiresDays = Number(params.expires_days ?? 7);

  const { data: existing, error: selErr } = await supabaseAdmin
    .from("tracker_invites")
    .select("id, expires_at, is_active, used_by_user_id")
    .eq("org_id", org_id)
    .eq("email_norm", email)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selErr) throw selErr;

  // Reutiliza el invite activo si existe (evita duplicados)
  if (existing?.id) {
    // “Marcar used_by_user_id” si la columna existe y está vacía (no rompe si no existe)
    if (!existing.used_by_user_id) {
      try {
        await supabaseAdmin
          .from("tracker_invites")
          .update({ used_by_user_id: invited_user_id })
          .eq("id", existing.id);
      } catch {
        // noop
      }
    }

    return { invite_id: String(existing.id), reused_invite: true };
  }

  const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString();

  // Insert robusto: intenta con used_by_user_id / used_at; si columnas no existen, reintenta mínimo
  const base = {
    org_id,
    email_norm: email,
    created_by_user_id: inviter_user_id,
    expires_at: expiresAt,
    is_active: true,
  };

  // Intento 1 (más completo)
  {
    const { data: created, error } = await supabaseAdmin
      .from("tracker_invites")
      .insert({
        ...base,
        used_by_user_id: invited_user_id, // “marcado” del usuario invitado (no consume el invite)
        // used_at: null (se marca al consumir en callback/flow)
      })
      .select("id")
      .single();

    if (!error && created?.id) return { invite_id: String(created.id), reused_invite: false };

    // Si falla por columna inexistente, reintenta mínimo
    if (error && /column .* does not exist/i.test(String(error.message || ""))) {
      const { data: created2, error: error2 } = await supabaseAdmin
        .from("tracker_invites")
        .insert(base)
        .select("id")
        .single();

      if (error2 || !created2?.id) throw error2 || new Error("Failed to create invite");
      return { invite_id: String(created2.id), reused_invite: false };
    }

    throw error || new Error("Failed to create invite");
  }
}

/* ------------------------------------------------------------------ */
/* REDIRECT: path relativo + añade contexto */
/* ------------------------------------------------------------------ */

function buildRedirectTo(params: {
  publicSiteUrl: string;
  redirect_to_path: string; // ej: /tracker-gps?tg_flow=tracker
  org_id: string;
  invite_id: string;
  email: string;
  tg_flow: string;
  force_swap: boolean;
  person_id?: string;
}) {
  const { publicSiteUrl, redirect_to_path, org_id, invite_id, email, tg_flow, force_swap, person_id } =
    params;

  const u = new URL(redirect_to_path, "https://local.invalid");
  u.searchParams.set("tg_flow", tg_flow || "tracker");

  // ✅ org_id / invite_id son server-side
  u.searchParams.set("org_id", org_id);
  u.searchParams.set("invite_id", invite_id);
  u.searchParams.set("invited_email", email);
  if (force_swap) u.searchParams.set("force_swap", "1");
  if (person_id) u.searchParams.set("person_id", String(person_id));

  const next = `${u.pathname}?${u.searchParams.toString()}`;

  const cb = new URL(`${publicSiteUrl}/auth/callback`);
  cb.searchParams.set("next", next);
  cb.searchParams.set("tg_flow", tg_flow || "tracker");
  cb.searchParams.set("invited_email", email);
  if (force_swap) cb.searchParams.set("force_swap", "1");
  cb.searchParams.set("org_id", org_id);
  cb.searchParams.set("invite_id", invite_id);
  if (person_id) cb.searchParams.set("person_id", String(person_id));

  return cb.toString();
}

/* ------------------------------------------------------------------ */
/* HANDLER */
/* ------------------------------------------------------------------ */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const publicSiteUrl = getPublicSiteUrl(req);
    if (!publicSiteUrl) {
      return res.status(500).json({
        error:
          "Missing PUBLIC_SITE_URL and cannot infer from request headers. Set PUBLIC_SITE_URL in Vercel env.",
      });
    }

    // ✅ Canonical server-side context (no org_id from frontend)
    const ctx: any = await resolveOrgAndMembership(req, res);
    if (!ctx?.ok && ctx?.status) {
      return res.status(ctx.status).json({ error: ctx.error || "Unauthorized", details: ctx.details });
    }

    const inviter_user_id: string = String(ctx.user_id || ctx.user?.id || "");
    const org_id: string = String(ctx.org_id || "");
    const inviter_role: string = String(ctx.role || "").toLowerCase();

    if (!inviter_user_id || !org_id) {
      return res.status(500).json({
        error: "Contexto incompleto",
        details: "resolveOrgAndMembership no devolvió org_id/user_id",
      });
    }

    // ✅ Solo owner/admin pueden invitar trackers en ESA org resuelta
    if (inviter_role !== "owner" && inviter_role !== "admin") {
      return res.status(403).json({ error: "Forbidden: inviter is not owner/admin in this org" });
    }

    const body = (req.body as any) || {};

    const email = normEmail(body.email);

    // Params UI (permitidos)
    const mode: "invite" | "resend" = body.mode === "resend" ? "resend" : "invite";
    const tg_flow = String(body.tg_flow || "tracker").trim() || "tracker";
    const force_swap = toBool(body.force_swap, true);

    const redirect_to_path = safePathOrDefault(body.redirect_to, "/tracker-gps?tg_flow=tracker");

    // Opcional: solo se propaga como param, NO toca DB
    const person_id = body.person_id ? String(body.person_id) : undefined;

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Invalid email" });
    }

    /* ------------------------------------------------------------ */
    /* 1) USER AUTH: crear user si no existe */
    /* ------------------------------------------------------------ */

    let trackerUserId = await findUserIdByEmail(email);

    if (!trackerUserId) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: false,
        user_metadata: {
          invited_as: "tracker",
          invited_by: inviter_user_id,
          invited_org_id: org_id,
        },
      });

      if (error) return res.status(400).json({ error: error.message });
      trackerUserId = created?.user?.id || null;
    }

    if (!trackerUserId) {
      return res.status(500).json({ error: "Cannot resolve tracker user_id" });
    }

    /* ------------------------------------------------------------ */
    /* 2) VALIDACIÓN: no roles incompatibles y membership tracker */
    /* ------------------------------------------------------------ */

    await ensureTrackerMembership({
      user_id: trackerUserId,
      org_id,
      inviter_user_id,
      force_swap,
    });

    /* ------------------------------------------------------------ */
    /* 3) INVITE (DB) - NO cross-org */
    /* ------------------------------------------------------------ */

    const { invite_id, reused_invite } = await getOrCreateActiveInvite({
      org_id,
      email,
      inviter_user_id,
      invited_user_id: trackerUserId,
      mode,
    });

    /* ------------------------------------------------------------ */
    /* 4) REDIRECT (respeta UI + agrega contexto) */
    /* ------------------------------------------------------------ */

    const redirectTo = buildRedirectTo({
      publicSiteUrl,
      redirect_to_path,
      org_id,
      invite_id,
      email,
      tg_flow,
      force_swap,
      person_id,
    });

    /* ------------------------------------------------------------ */
    /* 5) MAGIC LINK */
    /* ------------------------------------------------------------ */

    const { error: otpErr } = await supabaseAnon.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: false,
      },
    });

    if (otpErr) return res.status(400).json({ error: otpErr.message });

    return res.status(200).json({
      ok: true,
      email,
      org_id, // server-side
      invite_id,
      reused_invite,
      email_sent: true,
      invite_link: redirectTo,

      // extras debug UI
      mode,
      tg_flow,
      force_swap,
      redirect_to_path,
      person_id: person_id || null,
      public_site_url: publicSiteUrl,
    });
  } catch (e: any) {
    console.error("invite-tracker error", e);
    const msg = String(e?.message || "Internal error");

    if (msg.toLowerCase().includes("forbidden")) {
      return res.status(403).json({ error: msg });
    }

    return res.status(500).json({ error: msg });
  }
}
