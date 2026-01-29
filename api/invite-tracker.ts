import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

// Cliente "anon" SOLO para disparar el email OTP/magiclink (Supabase manda el correo)
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

function buildRedirectTo(org_id: string) {
  return (
    `${PUBLIC_SITE_URL}/auth/callback` +
    `?next=/tracker-gps&org_id=${org_id}&tg_flow=tracker`
  );
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
        error: "Missing env SUPABASE_ANON_KEY (required to send OTP email via Supabase)",
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
    const person_id = body.person_id ? String(body.person_id) : null;
    const force_tracker_default = !!body.force_tracker_default;

    if (!email || !email.includes("@")) return res.status(400).json({ error: "Invalid email" });
    if (!isUuid(org_id)) return res.status(400).json({ error: "Invalid org_id (must be UUID)" });

    const redirectTo = buildRedirectTo(org_id);

    // 2) Asegurar que el usuario exista (si no existe, lo creamos sin confirmar)
    //    Luego mandamos el magic link por email con signInWithOtp (Supabase envía).
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

    if (!trackerUserId) {
      // fallback duro
      trackerUserId = await findUserIdByEmail(email);
    }
    if (!trackerUserId) {
      return res.status(500).json({ error: "Could not resolve tracker user id" });
    }

    // 3) Asegurar membership tracker (idempotente)
    await supabaseAdmin
      .from("memberships")
      .upsert({ user_id: trackerUserId, org_id, role: "tracker" }, { onConflict: "user_id,org_id" });

    // 4) Auto-asignación (si se pidió)
    let assignment_id: string | null = null;
    if (force_tracker_default) {
      const { data: assignId, error: assignErr } = await supabaseAdmin.rpc(
        "upsert_tracker_assignment_auto",
        {
          p_tenant_id: org_id,
          p_tracker_user_id: trackerUserId,
          p_frequency_minutes: 1,
        }
      );
      if (!assignErr && assignId) assignment_id = String(assignId);
    }

    // 5) ENVIAR EMAIL SIEMPRE (Supabase)
    //    - shouldCreateUser: false porque ya lo aseguramos arriba
    const { error: otpErr } = await supabaseAnon.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: false,
      },
    });

    if (otpErr) {
      return res.status(400).json({ error: otpErr.message || "Error sending Supabase email" });
    }

    return res.status(200).json({
      ok: true,
      email,
      email_sent: true,
      tracker_user_id: trackerUserId,
      person_id,
      assignment_id,
      redirect_to: redirectTo,
    });
  } catch (e: any) {
    console.error("invite-tracker error", e);
    return res.status(500).json({ error: e?.message || "Internal server error" });
  }
}
