// api/invite-tracker.ts
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_ANON_KEY!;

// Puede venir vacío en algunos deploys; lo resolvemos con fallback desde headers.
const PUBLIC_SITE_URL_ENV = (process.env.PUBLIC_SITE_URL || "").replace(/\/+$/, "");

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const supabaseAnon = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false },
});

function isUuid(v: any) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "").trim()
  );
}

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
  // Permitimos solo paths relativos seguros (evitar open-redirect)
  if (!s.startsWith("/")) return def;
  // Evitar protocolos escondidos
  if (s.startsWith("//")) return def;
  return s;
}

/* ------------------------------------------------------------------ */
/* SITE URL (robusto) */
/* ------------------------------------------------------------------ */

function getPublicSiteUrl(req: VercelRequest) {
  if (PUBLIC_SITE_URL_ENV) return PUBLIC_SITE_URL_ENV;

  // Fallback Vercel: construir desde headers
  const proto = String(req.headers["x-forwarded-proto"] || "https")
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();

  if (!host) return "";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

/* ------------------------------------------------------------------ */
/* AUTH HELPERS */
/* ------------------------------------------------------------------ */

// ✅ Preferir getUserByEmail si existe; fallback a listUsers paginado
async function findUserIdByEmail(email: string): Promise<string | null> {
  // 1) Si la lib soporta getUserByEmail (según versión)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyAdmin: any = supabaseAdmin.auth.admin as any;
    if (typeof anyAdmin.getUserByEmail === "function") {
      const { data, error } = await anyAdmin.getUserByEmail(email);
      if (error) throw error;
      if (data?.user?.id) return String(data.user.id);
    }
  } catch {
    // seguimos al fallback
  }

  // 2) Fallback robusto: listUsers paginado
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
/* PERMISSIONS: solo owner/admin pueden invitar trackers en esa org */
/* ------------------------------------------------------------------ */

async function assertInviterCanInvite(params: { inviter_user_id: string; org_id: string }) {
  const { inviter_user_id, org_id } = params;

  const { data, error } = await supabaseAdmin
    .from("memberships")
    .select("role")
    .eq("user_id", inviter_user_id)
    .eq("org_id", org_id)
    .maybeSingle();

  if (error) throw error;

  const role = String(data?.role || "").toLowerCase();
  if (role !== "owner" && role !== "admin") {
    throw new Error("Forbidden: inviter is not owner/admin in this org");
  }
}

/* ------------------------------------------------------------------ */
/* MEMBERSHIP (FUENTE ÚNICA DE VERDAD) */
/* ------------------------------------------------------------------ */

async function ensureTrackerMembership(params: { user_id: string; org_id: string }) {
  const { user_id, org_id } = params;

  const { data, error } = await supabaseAdmin
    .from("memberships")
    .select("id")
    .eq("user_id", user_id)
    .eq("org_id", org_id)
    .eq("role", "tracker")
    .maybeSingle();

  if (error) throw error;
  if (data?.id) return;

  const { error: insErr } = await supabaseAdmin.from("memberships").insert({
    user_id,
    org_id,
    role: "tracker",
  });

  if (insErr) throw insErr;
}

/* ------------------------------------------------------------------ */
/* INVITES (DB) */
/* ------------------------------------------------------------------ */

async function getOrCreateActiveInvite(params: {
  org_id: string;
  email: string;
  inviter_user_id: string;
  expires_days?: number;
  mode?: "invite" | "resend";
}) {
  const { org_id, email, inviter_user_id } = params;
  const expiresDays = Number(params.expires_days ?? 7);
  const mode = params.mode === "resend" ? "resend" : "invite";

  // En "resend" podemos reutilizar link vigente.
  // En "invite" también reutilizamos para evitar duplicados (tu UI ya lo muestra como reused_invite).
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("tracker_invites")
    .select("id, expires_at, is_active")
    .eq("org_id", org_id)
    .eq("email_norm", email)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selErr) throw selErr;

  if (existing?.id) {
    // Si está activo, lo reutilizamos (independiente de mode).
    return { invite_id: String(existing.id), reused_invite: true };
  }

  const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: created, error } = await supabaseAdmin
    .from("tracker_invites")
    .insert({
      org_id,
      email_norm: email,
      created_by_user_id: inviter_user_id,
      expires_at: expiresAt,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    throw error || new Error("Failed to create invite");
  }

  return { invite_id: String(created.id), reused_invite: false };
}

/* ------------------------------------------------------------------ */
/* REDIRECT: respeta redirect_to de UI (path relativo) + añade contexto */
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
  const {
    publicSiteUrl,
    redirect_to_path,
    org_id,
    invite_id,
    email,
    tg_flow,
    force_swap,
    person_id,
  } = params;

  // Construimos "next" como URL relativa (ruta final dentro de la app)
  // y le anexamos params útiles para el callback/flow.
  const u = new URL(redirect_to_path, "https://local.invalid"); // base dummy
  u.searchParams.set("tg_flow", tg_flow || "tracker");
  u.searchParams.set("org_id", org_id);
  u.searchParams.set("invite_id", invite_id);
  u.searchParams.set("invited_email", email);
  if (force_swap) u.searchParams.set("force_swap", "1");
  if (person_id) u.searchParams.set("person_id", String(person_id));

  const next = `${u.pathname}?${u.searchParams.toString()}`;

  // Supabase manda al callback de tu app, y tu callback redirige a `next`.
  // También repetimos params principales a nivel callback por si tu callback los lee directo.
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

    const authHeader = String(req.headers.authorization || "");
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return res.status(401).json({ error: "Missing Authorization" });

    const { data: userData, error: getUserErr } = await supabaseAdmin.auth.getUser(token);
    if (getUserErr) return res.status(401).json({ error: "Invalid session" });

    const inviter = userData?.user;
    if (!inviter?.id) return res.status(401).json({ error: "Invalid session" });

    const body = req.body || {};

    const email = normEmail(body.email);
    const org_id = String(body.org_id || "").trim();

    // Params que manda tu UI
    const mode: "invite" | "resend" = body.mode === "resend" ? "resend" : "invite";
    const tg_flow = String(body.tg_flow || "tracker").trim() || "tracker";
    const force_swap = toBool(body.force_swap, true);

    // El UI manda redirect_to (path relativo); si no, usamos default
    const redirect_to_path = safePathOrDefault(
      body.redirect_to,
      "/tracker-gps?tg_flow=tracker"
    );

    // Opcional: para debug/flujo (no lo guardamos en DB a ciegas)
    const person_id = body.person_id ? String(body.person_id) : undefined;

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Invalid email" });
    }
    if (!isUuid(org_id)) {
      return res.status(400).json({ error: "Invalid org_id" });
    }

    // ✅ Seguridad multi-tenant: validar que inviter pueda invitar en esa org
    await assertInviterCanInvite({ inviter_user_id: inviter.id, org_id });

    /* ------------------------------------------------------------ */
    /* 1) USER AUTH: crear user si no existe */
    /* ------------------------------------------------------------ */

    let trackerUserId = await findUserIdByEmail(email);
    if (!trackerUserId) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: false,
        // Opcional: marca para analytics/debug
        user_metadata: {
          invited_as: "tracker",
          invited_by: inviter.id,
          invited_org_id: org_id,
        },
      });

      if (error) {
        return res.status(400).json({ error: error.message });
      }
      trackerUserId = created?.user?.id || null;
    }

    if (!trackerUserId) {
      return res.status(500).json({ error: "Cannot resolve tracker user_id" });
    }

    /* ------------------------------------------------------------ */
    /* 2) MEMBERSHIP (fuente única de verdad) */
    /* ------------------------------------------------------------ */

    await ensureTrackerMembership({
      user_id: trackerUserId,
      org_id,
    });

    /* ------------------------------------------------------------ */
    /* 3) INVITE (db) */
    /* ------------------------------------------------------------ */

    const { invite_id, reused_invite } = await getOrCreateActiveInvite({
      org_id,
      email,
      inviter_user_id: inviter.id,
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

    if (otpErr) {
      return res.status(400).json({ error: otpErr.message });
    }

    return res.status(200).json({
      ok: true,
      email,
      org_id,
      invite_id,
      reused_invite,
      email_sent: true,
      invite_link: redirectTo,

      // extras útiles para debug UI
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

    // Mensajes más claros
    if (msg.toLowerCase().includes("forbidden")) {
      return res.status(403).json({ error: msg });
    }

    return res.status(500).json({ error: msg });
  }
}
