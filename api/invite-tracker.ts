import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

// Cliente "anon" SOLO para disparar el email OTP/magiclink
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    if (!PUBLIC_SITE_URL) {
      return res.status(500).json({
        error: "Missing env PUBLIC_SITE_URL (e.g. https://app.tugeocercas.com)",
      });
    }
    if (!anonKey) {
      return res.status(500).json({
        error: "Missing env SUPABASE_ANON_KEY",
      });
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();
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

    if (!email || !email.includes("@")) return res.status(400).json({ error: "Invalid email" });
    if (!isUuid(org_id)) return res.status(400).json({ error: "Invalid org_id (must be UUID)" });

    // 2) Asegurar usuario (solo para que exista en auth y el link funcione)
    let trackerUserId = await findUserIdByEmail(email);
    if (!trackerUserId) {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: false,
      });
      if (createErr) {
        return res.status(400).json({ error: createErr.message || "Error creating user" });
      }
      trackerUserId = created?.user?.id || null;
    }
    if (!trackerUserId) trackerUserId = await findUserIdByEmail(email);
    if (!trackerUserId) return res.status(500).json({ error: "Could not resolve tracker user id" });

    // 3) Crear INVITE (fuente de verdad del onboarding)
    const { data: inv, error: invErr } = await supabaseAdmin
      .from("tracker_invites")
      .insert({
        org_id,
        email_norm: email,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (invErr || !inv?.id) {
      return res.status(500).json({ error: invErr?.message || "Failed to create tracker invite" });
    }

    const invite_id = String(inv.id);

    // 4) Redirect incluye invite_id (para aceptar y vincular auth.uid real)
    const redirectTo =
      `${PUBLIC_SITE_URL}/auth/callback` +
      `?next=/tracker-gps&org_id=${org_id}&invite_id=${invite_id}&tg_flow=tracker`;

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
      email,
      email_sent: true,
      org_id,
      invite_id,
      redirect_to: redirectTo,
      note: "Membership y asignaciones se crean SOLO al aceptar el invite (auth.uid real).",
    });
  } catch (e: any) {
    console.error("invite-tracker error", e);
    return res.status(500).json({ error: e?.message || "Internal server error" });
  }
}
