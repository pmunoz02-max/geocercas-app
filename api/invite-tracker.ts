import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || ""; // e.g. https://app.tugeocercas.com

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
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
  // Supabase Admin API no tiene "get user by email" directo,
  // así que listamos y buscamos. Para tu escala actual sirve perfecto.
  let page = 1;
  const perPage = 200;

  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    const users = data?.users || [];
    const hit = users.find((u) => normEmail(u.email) === email);
    if (hit?.id) return hit.id;

    // si ya no hay más usuarios, terminar
    if (users.length < perPage) break;
    page++;
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
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

    if (!PUBLIC_SITE_URL) {
      return res.status(500).json({
        error: "Missing env PUBLIC_SITE_URL (e.g. https://app.tugeocercas.com)",
      });
    }

    const redirectTo =
      `${PUBLIC_SITE_URL}/auth/callback` +
      `?next=/tracker-gps&org_id=${org_id}&tg_flow=tracker`;

    let trackerUserId: string | null = null;
    let email_sent = false;
    let magic_link: string | null = null;

    // 2) Intentar invitar por email (manda correo SOLO si el usuario no existe)
    const { data: inviteData, error: inviteErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo });

    if (!inviteErr) {
      email_sent = true;
      trackerUserId = inviteData?.user?.id || null;
    } else {
      const msg = String(inviteErr.message || "").toLowerCase();

      // 3) Fallback si ya existe: generar magic link (no manda correo automáticamente)
      if (msg.includes("already been registered") || msg.includes("already registered")) {
        trackerUserId = await findUserIdByEmail(email);
        if (!trackerUserId) {
          return res.status(400).json({
            error: "User already registered but could not be found via admin listUsers()",
          });
        }

        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo },
        });

        if (linkErr) {
          return res.status(400).json({ error: linkErr.message || "Error generating magic link" });
        }

        magic_link =
          (linkData as any)?.properties?.action_link ||
          (linkData as any)?.action_link ||
          null;

        if (!magic_link) {
          return res.status(500).json({ error: "Generated link but action_link not found" });
        }
      } else {
        // otro error real
        return res.status(400).json({ error: inviteErr.message || "Error sending invite email" });
      }
    }

    if (!trackerUserId) {
      return res.status(500).json({ error: "Tracker user id not resolved" });
    }

    // 4) Asegurar membership como tracker (idempotente)
    await supabaseAdmin.from("memberships").upsert(
      { user_id: trackerUserId, org_id, role: "tracker" },
      { onConflict: "user_id,org_id" }
    );

    // 5) Auto-asignación (si se pidió)
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

    // 6) Respuesta
    return res.status(200).json({
      ok: true,
      email,
      email_sent,          // true si Supabase mandó correo (usuario nuevo)
      magic_link,          // presente si usuario ya existía (para copiar/WhatsApp)
      tracker_user_id: trackerUserId,
      person_id,
      assignment_id,
      redirect_to: redirectTo,
      note: email_sent
        ? "Invite email sent by Supabase."
        : "User already existed: generated magic_link for manual delivery (WhatsApp/Email).",
    });
  } catch (e: any) {
    console.error("invite-tracker error", e);
    return res.status(500).json({ error: e?.message || "Internal server error" });
  }
}
