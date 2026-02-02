// api/invite-tracker.ts
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL || "").replace(/\/+$/, "");

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

async function findUserIdByEmail(email: string): Promise<string | null> {
  let page = 1;
  const perPage = 200;

  for (let i = 0; i < 30; i++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    const hit = users.find((u) => normEmail(u.email) === email);
    if (hit?.id) return hit.id;

    if (users.length < perPage) break;
    page++;
  }
  return null;
}

/**
 * Redirect canónico para AuthCallback (React).
 * Todo lo que TrackerGpsPage necesita va dentro de "next".
 */
function buildRedirectTo(params: { org_id: string; invite_id: string; email: string }) {
  const { org_id, invite_id, email } = params;

  const next =
    `/tracker-gps` +
    `?tg_flow=tracker` +
    `&org_id=${encodeURIComponent(org_id)}` +
    `&invite_id=${encodeURIComponent(invite_id)}` +
    `&invited_email=${encodeURIComponent(email)}`;

  const redirectTo =
    `${PUBLIC_SITE_URL}/auth/callback` +
    `?next=${encodeURIComponent(next)}` +
    `&tg_flow=tracker` +
    `&invited_email=${encodeURIComponent(email)}`;

  return redirectTo;
}

type TrackerInviteRow = {
  id: string;
  created_at: string | null;
  expires_at: string | null;
  is_active?: boolean | null;
};

function msSince(iso: string | null | undefined) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Date.now() - t;
}

async function getOrCreateActiveInvite(params: {
  org_id: string;
  email: string;
  inviter_user_id: string;
  expires_days?: number;
  cooldown_ms?: number;
}) {
  const { org_id, email, inviter_user_id } = params;
  const expiresDays = Number(params.expires_days ?? 7);
  const cooldownMs = Number(params.cooldown_ms ?? 60_000);

  // 1) buscar invite activo (garantizado único por índice parcial)
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("tracker_invites")
    .select("id, created_at, expires_at, is_active")
    .eq("org_id", org_id)
    .eq("email_norm", email)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<TrackerInviteRow>();

  if (exErr) throw exErr;

  if (existing?.id) {
    return { invite_id: String(existing.id), reused_invite: true };
  }

  // 2) no hay activo → crear uno nuevo
  const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: created, error: crErr } = await supabaseAdmin
    .from("tracker_invites")
    .insert({
      org_id,
      email_norm: email,
      created_by_user_id: inviter_user_id,
      expires_at: expiresAt,
      // is_active lo setea el trigger
    })
    .select("id, created_at, expires_at, is_active")
    .single<TrackerInviteRow>();

  if (crErr || !created?.id) throw crErr || new Error("Failed to create invite");

  let invite_id = String(created.id);
  let reused_invite = false;

  // 3) Airbag anti-race/spam: si por timing alguien creó uno “muy reciente”, reusamos el más reciente
  const { data: recent, error: recErr } = await supabaseAdmin
    .from("tracker_invites")
    .select("id, created_at, expires_at, is_active")
    .eq("org_id", org_id)
    .eq("email_norm", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<TrackerInviteRow>();

  if (!recErr && recent?.id) {
    const age = msSince(recent.created_at);
    if (age < cooldownMs) {
      invite_id = String(recent.id);
      reused_invite = true;
    }
  }

  return { invite_id, reused_invite };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    if (!PUBLIC_SITE_URL) {
      return res.status(500).json({
        error: "Missing env PUBLIC_SITE_URL (e.g. https://app.tugeocercas.com)",
      });
    }
    if (!anonKey) {
      return res.status(500).json({ error: "Missing env SUPABASE_ANON_KEY" });
    }

    const authHeader = String(req.headers.authorization || "");
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return res.status(401).json({ error: "Missing Authorization header" });

    // 1) Validar sesión del invitador
    const {
      data: { user: inviter },
      error: authErr,
    } = await supabaseAdmin.auth.getUser(token);

    if (authErr || !inviter) return res.status(401).json({ error: "Invalid session" });

    const body = req.body || {};
    const email = normEmail(body.email);
    const org_id = String(body.org_id || "").trim();
    const mode = String(body.mode || "invite").trim().toLowerCase(); // invite | resend (solo UX)

    if (!email || !email.includes("@")) return res.status(400).json({ error: "Invalid email" });
    if (!isUuid(org_id)) return res.status(400).json({ error: "Invalid org_id (must be UUID)" });

    // 2) Asegurar usuario en auth (para que el magiclink funcione)
    let trackerUserId = await findUserIdByEmail(email);
    if (!trackerUserId) {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: false,
      });
      if (createErr) return res.status(400).json({ error: createErr.message || "Error creating user" });
      trackerUserId = created?.user?.id || null;
    }
    if (!trackerUserId) trackerUserId = await findUserIdByEmail(email);
    if (!trackerUserId) return res.status(500).json({ error: "Could not resolve tracker user id" });

    // 3) Idempotencia: reusar invite activo o crear nuevo
    const { invite_id, reused_invite } = await getOrCreateActiveInvite({
      org_id,
      email,
      inviter_user_id: inviter.id,
      expires_days: 7,
      cooldown_ms: 60_000,
    });

    // 4) redirectTo correcto (TODO dentro de next)
    const redirectTo = buildRedirectTo({ org_id, invite_id, email });

    // 5) Enviar magic link
    const { error: otpErr } = await supabaseAnon.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: false,
      },
    });

    if (otpErr) return res.status(400).json({ error: otpErr.message || "Error sending email" });

    return res.status(200).json({
      ok: true,
      mode,
      email,
      email_sent: true,
      org_id,
      invite_id,
      reused_invite,
      redirect_to: redirectTo,
      note: "Idempotente: si existe invite activo para (org_id,email_norm) se reutiliza y se reenvía email.",
    });
  } catch (e: any) {
    console.error("invite-tracker error", e);
    return res.status(500).json({ error: e?.message || "Internal server error" });
  }
}
