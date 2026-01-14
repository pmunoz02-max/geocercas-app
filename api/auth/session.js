import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const out = {};
  raw.split(";").map(v => v.trim()).filter(Boolean).forEach(kv => {
    const i = kv.indexOf("=");
    if (i > 0) out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  });
  return out;
}

export default async function handler(req, res) {
  try {
    const cookies = parseCookies(req);

    // ✅ TU LOGIN NO-JS
    const access_token = cookies.tg_at;

    if (!access_token) {
      return res.json({ authenticated: false });
    }

    const { data, error } =
      await supabaseAdmin.auth.getUser(access_token);

    if (error || !data?.user) {
      return res.json({ authenticated: false });
    }

    const user = {
      id: data.user.id,
      email: data.user.email,
    };

    // org actual
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("current_org_id, default_org_id, org_id")
      .eq("id", user.id)
      .maybeSingle();

    let current_org_id =
      profile?.current_org_id ||
      profile?.default_org_id ||
      profile?.org_id ||
      null;

    if (!current_org_id) {
      const { data: ms } = await supabaseAdmin
        .from("memberships")
        .select("org_id")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1);

      current_org_id = ms?.[0]?.org_id || null;
    }

    let role = null;
    if (current_org_id) {
      const { data: r1 } = await supabaseAdmin
        .from("app_user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("org_id", current_org_id)
        .maybeSingle();

      role = r1?.role || null;

      if (!role) {
        const { data: r2 } = await supabaseAdmin
          .from("memberships")
          .select("role")
          .eq("user_id", user.id)
          .eq("org_id", current_org_id)
          .maybeSingle();

        role = r2?.role || null;
      }
    }

    return res.json({
      authenticated: true,
      user,
      current_org_id,
      role,
    });
  } catch (e) {
    console.error(e);
    return res.json({ authenticated: false });
  }
}
