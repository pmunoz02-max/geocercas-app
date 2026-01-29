// api/invite-tracker.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

type InviteBody = {
  email?: string;
  org_id?: string;
  person_id?: string;
  force_tracker_default?: boolean;

  // opcionales universales (si luego quieres controlarlos desde UI)
  frequency_minutes?: number; // default 1
  days?: number; // default 30
};

function getBearer(req: VercelRequest) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || "";
}

async function findUserIdByEmail(admin: any, email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  // Paginado defensivo (ajusta maxPages si tienes muchísimos usuarios)
  const perPage = 200;
  const maxPages = 20;

  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const hit = users.find((u: any) => String(u?.email || "").toLowerCase() === target);
    if (hit?.id) return String(hit.id);
    if (users.length < perPage) break; // no más páginas
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token = getBearer(req);
    if (!token) return res.status(401).json({ error: "Missing Bearer token" });

    const body = (req.body || {}) as InviteBody;
    const email = String(body.email || "").trim().toLowerCase();
    const org_id = String(body.org_id || "").trim();
    const person_id = String(body.person_id || "").trim();
    const force_tracker_default = !!body.force_tracker_default;

    const frequency_minutes = Number.isFinite(Number(body.frequency_minutes))
      ? Math.max(1, Number(body.frequency_minutes))
      : 1;

    const days = Number.isFinite(Number(body.days)) ? Math.max(1, Number(body.days)) : 30;

    if (!email || !email.includes("@")) return res.status(400).json({ error: "Email inválido" });
    if (!org_id) return res.status(400).json({ error: "org_id requerido" });
    if (!person_id) return res.status(400).json({ error: "person_id requerido" });

    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const publicAppUrl = (process.env.PUBLIC_APP_URL || "https://app.tugeocercas.com").replace(/\/$/, "");

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
    }

    // ✅ Cliente ADMIN PURO (NO sobreescribas Authorization)
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 1) Validar invitador usando el JWT recibido (sin romper admin)
    const { data: inviterData, error: inviterErr } = await admin.auth.getUser(token);
    if (inviterErr || !inviterData?.user) {
      return res.status(401).json({ error: "Invalid session" });
    }

    // (Opcional) aquí puedes validar permisos del invitador contra memberships/org si quieres

    // 2) Encontrar o crear usuario tracker
    let trackerUserId = await findUserIdByEmail(admin, email);

    if (!trackerUserId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
      });

      if (createErr || !created?.user?.id) {
        // Devuelve el error real para debug
        return res.status(500).json({
          error: "No se pudo crear el usuario tracker",
          details: createErr?.message || "createUser_failed",
        });
      }

      trackerUserId = String(created.user.id);
    }

    // 3) Upsert membership tracker (si tu tabla es public.memberships)
    // Ajusta nombres si tu esquema es distinto.
    const { error: membErr } = await admin.from("memberships").upsert(
      {
        user_id: trackerUserId,
        org_id,
        role: "tracker",
      },
      { onConflict: "user_id,org_id" }
    );
    if (membErr) {
      return res.status(500).json({
        error: "No se pudo asignar rol tracker en memberships",
        details: membErr.message,
      });
    }

    // 4) Auto-asignación universal (B) usando tu RPC (si existe geocerca default o al menos una)
    let assignment_id: string | null = null;
    if (force_tracker_default) {
      const { data: a, error: aErr } = await admin.rpc("upsert_tracker_assignment_auto", {
        p_org_id: org_id,
        p_tracker_email: email,
        p_frequency_minutes: frequency_minutes,
        p_days: days,
        p_active: true,
      });

      // si devuelve NULL => no hay geocercas en la org, es correcto (tracker queda esperando)
      if (!aErr && a) assignment_id = String(a);
      // si falla el RPC, NO bloqueamos la invitación, solo lo reportamos
      if (aErr) {
        // no aborta
        assignment_id = null;
      }
    }

    // 5) Magic link directo a /tracker-gps
    const redirectTo =
      `${publicAppUrl}/auth/callback` +
      `?next=/tracker-gps` +
      `&org_id=${encodeURIComponent(org_id)}` +
      `&tg_flow=tracker`;

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    const actionLink = linkData?.properties?.action_link;
    if (linkErr || !actionLink) {
      return res.status(500).json({
        error: "No se pudo generar magic link",
        details: linkErr?.message || "generateLink_failed",
      });
    }

    return res.status(200).json({
      magic_link: actionLink,
      redirect_to: redirectTo,
      tracker_default: true,
      assignment_id, // null si no hay geocercas/default (correcto)
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Unexpected error" });
  }
}
