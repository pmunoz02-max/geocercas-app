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

/* ------------------------------------------------------------------ */
/* AUTH HELPERS */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* REDIRECT */
/* ------------------------------------------------------------------ */

function buildRedirectTo(params: {
  org_id: string;
  invite_id: string;
  email: string;
}) {
  const { org_id, invite_id, email } = params;

  const next =
    `/tracker-gps` +
    `?tg_flow=tracker` +
    `&org_id=${encodeURIComponent(org_id)}` +
    `&invite_id=${encodeURIComponent(invite_id)}` +
    `&invited_email=${encodeURIComponent(email)}`;

  return (
    `${PUBLIC_SITE_URL}/auth/callback` +
    `?next=${encodeURIComponent(next)}` +
    `&tg_flow=tracker` +
    `&invited_email=${encodeURIComponent(email)}`
  );
}

/* ------------------------------------------------------------------ */
/* MEMBERSHIP (FUENTE ÚNICA DE VERDAD) */
/* ------------------------------------------------------------------ */

async function ensureTrackerMembership(params: {
  user_id: string;
  org_id: string;
}) {
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
/* INVITES */
/* ------------------------------------------------------------------ */

async function getOrCreateActiveInvite(params: {
  org_id: string;
  email: string;
  inviter_user_id: string;
  expires_days?: number;
}) {
  const { org_id, email, inviter_user_id } = params;
  const expiresDays = Number(params.expires_days ?? 7);

  const { data: existing } = await supabaseAdmin
    .from("tracker_invites")
    .select("id")
    .eq("org_id", org_id)
    .eq("email_norm", email)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return { invite_id: String(existing.id), reused_invite: true };
  }

  const expiresAt = new Date(
    Date.now() + expiresDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: created, error } = await supabaseAdmin
    .from("tracker_invites")
    .insert({
      org_id,
      email_norm: email,
      created_by_user_id: inviter_user_id,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    throw error || new Error("Failed to create invite");
  }

  return { invite_id: String(created.id), reused_invite: false };
}

/* ------------------------------------------------------------------ */
/* HANDLER */
/* ------------------------------------------------------------------ */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!PUBLIC_SITE_URL) {
      return res.status(500).json({
        error: "Missing env PUBLIC_SITE_URL",
      });
    }

    const authHeader = String(req.headers.authorization || "");
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return res.status(401).json({ error: "Missing Authorization" });

    const {
      data: { user: inviter },
    } = await supabaseAdmin.auth.getUser(token);

    if (!inviter) return res.status(401).json({ error: "Invalid session" });

    const body = req.body || {};
    const email = normEmail(body.email);
    const org_id = String(body.org_id || "").trim();

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Invalid email" });
    }
    if (!isUuid(org_id)) {
      return res.status(400).json({ error: "Invalid org_id" });
    }

    /* ------------------------------------------------------------ */
    /* 1) USER AUTH */
    /* ------------------------------------------------------------ */

    let trackerUserId = await findUserIdByEmail(email);
    if (!trackerUserId) {
      const { data: created, error } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: false,
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
    /* 2) MEMBERSHIP (CLAVE) */
    /* ------------------------------------------------------------ */

    await ensureTrackerMembership({
      user_id: trackerUserId,
      org_id,
    });

    /* ------------------------------------------------------------ */
    /* 3) INVITE */
    /* ------------------------------------------------------------ */

    const { invite_id, reused_invite } = await getOrCreateActiveInvite({
      org_id,
      email,
      inviter_user_id: inviter.id,
    });

    const redirectTo = buildRedirectTo({ org_id, invite_id, email });

    /* ------------------------------------------------------------ */
    /* 4) MAGIC LINK */
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
    });
  } catch (e: any) {
    console.error("invite-tracker error", e);
    return res.status(500).json({ error: e?.message || "Internal error" });
  }
}
