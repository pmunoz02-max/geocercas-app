// api/auth/session.js
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function pickCookie(req, name) {
  const raw = req.headers.cookie || "";
  const part = raw.split(";").map(s => s.trim()).find(s => s.startsWith(name + "="));
  return part ? decodeURIComponent(part.split("=").slice(1).join("=")) : null;
}

// Normaliza roles (por si vienen "ADMIN" vs "admin")
function normRole(r) {
  if (!r) return null;
  const x = String(r).toLowerCase();
  if (x === "owner" || x === "admin" || x === "tracker" || x === "viewer") return x;
  return x;
}

export default async function handler(req, res) {
  try {
    // Si estás usando cookies HttpOnly, normalmente guardas el access_token en una cookie
    // Ajusta el nombre si el tuyo es otro:
    const access_token = pickCookie(req, "sb-access-token") || pickCookie(req, "access_token");

    if (!access_token) {
      return res.status(200).json({ authenticated: false });
    }

    // Validar token contra Supabase
    const { data: u, error: uerr } = await supabaseAdmin.auth.getUser(access_token);
    if (uerr || !u?.user) {
      return res.status(200).json({ authenticated: false });
    }

    const user = { id: u.user.id, email: u.user.email };

    // 1) Buscar org desde profiles (preferido)
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("current_org_id, default_org_id, org_id")
      .eq("id", user.id)
      .maybeSingle();

    let current_org_id = prof?.current_org_id || prof?.default_org_id || prof?.org_id || null;

    // 2) Fallback: org default desde memberships
    if (!current_org_id) {
      const { data: ms } = await supabaseAdmin
        .from("memberships")
        .select("org_id, role, is_default, created_at")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1);

      current_org_id = ms?.[0]?.org_id || null;
    }

    // 3) Resolver role para esa org (prefer app_user_roles)
    let role = null;
    if (current_org_id) {
      const { data: aur } = await supabaseAdmin
        .from("app_user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("org_id", current_org_id)
        .maybeSingle();

      role = normRole(aur?.role);

      if (!role) {
        const { data: m1 } = await supabaseAdmin
          .from("memberships")
          .select("role")
          .eq("user_id", user.id)
          .eq("org_id", current_org_id)
          .maybeSingle();

        role = normRole(m1?.role);
      }
    }

    return res.status(200).json({
      authenticated: true,
      access_token,
      user,
      current_org_id,
      role,
    });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ authenticated: false });
  }
}
