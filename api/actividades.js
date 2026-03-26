// Extrae Bearer token del header Authorization
function getBearerToken(req) {
  const auth = req.headers?.authorization || "";
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}
import { createClient } from "@supabase/supabase-js";

const VERSION = "actividades-v3-debug";

function getSupabase(req) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      global: {
        headers: {
          Authorization: req.headers.authorization || "",
        },
      },
    }
  );
  return supabase;
}

async function resolveContext(req, supabase, requestedOrgId) {
  // Auth resolver compatible con cookie tg_at y Authorization Bearer
  const cookieToken = getCookie(req, "tg_at");
  const bearerToken = getBearerToken(req);
  const accessToken = cookieToken || bearerToken;
  const hasCookieToken = !!cookieToken;
  const hasBearerToken = !!bearerToken;
  const hasAccessToken = !!accessToken;
  console.log("[ACTIVIDADES AUTH] token sources", { hasCookieToken, hasBearerToken, hasAccessToken, method: req.method, url: req.url });
  if (!accessToken) {
    return { errorResponse: { status: 401, body: { error: "No session token (cookie tg_at or Authorization Bearer)" } } };
  }
  const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !user) {
    return { errorResponse: { status: 401, body: { error: "unauthorized" } } };
  }
  const orgId = requestedOrgId;
  if (!orgId) {
    return {
      errorResponse: { status: 400, body: { error: "missing_org_id" } },
    };
  }
  return { orgId, user };
}

async function findActivityByIdCompat(supabase, id, orgId) {
  console.log("[findActivityByIdCompat] start", { id, orgId });

  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  console.log("[findActivityByIdCompat] row", {
    id,
    orgId,
    data,
    error: error
      ? {
          message: error.message,
          code: error.code,
          hint: error.hint,
        }
      : null,
  });

  if (error) return { data: null, error };
  if (!data) return { data: null, error: null };

  const rowOrgId = data.org_id ? String(data.org_id) : null;
  const rowTenantId = data.tenant_id ? String(data.tenant_id) : null;
  const wantedOrgId = String(orgId);

  const allowed =
    rowOrgId === wantedOrgId ||
    (rowOrgId == null && rowTenantId === wantedOrgId);

  console.log("[findActivityByIdCompat] ownership", {
    id,
    orgId,
    rowOrgId,
    rowTenantId,
    wantedOrgId,
    allowed,
  });

  if (!allowed) return { data: null, error: null };

  return { data, error: null };
}

export default async function handler(req, res) {
  res.setHeader("X-Api-Version", VERSION);

  const supabase = getSupabase(req);

  const requestedOrgIdRaw = req.query?.org_id || req.query?.orgId || null;
  const requestedOrgId = requestedOrgIdRaw
    ? String(requestedOrgIdRaw).trim()
    : null;

  const idRaw = typeof req.query?.id === "string" ? req.query.id : null;
  const id = idRaw ? String(idRaw).trim() : null;

  console.log("[ACTIVIDADES] incoming", {
    method: req.method,
    query: req.query,
    requestedOrgIdRaw,
    requestedOrgId,
    idRaw,
    id,
    version: VERSION,
  });

  const { orgId, user, errorResponse } = await resolveContext(
    req,
    supabase,
    requestedOrgId
  );

  if (errorResponse) {
    return res.status(errorResponse.status).json(errorResponse.body);
  }

  console.log("[ACTIVIDADES] context", {
    method: req.method,
    orgId,
    userId: user?.id || null,
    requestedOrgId,
    id,
  });

  // GET
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .or(
        `org_id.eq.${orgId},and(org_id.is.null,tenant_id.eq.${orgId})`
      )
      .order("active", { ascending: false })
      .order("name", { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data);
  }

  // PATCH (toggle active)
  if (req.method === "PATCH") {
    const found = await findActivityByIdCompat(supabase, id, orgId);

    if (found.error) {
      return res.status(500).json({ error: "lookup_failed" });
    }

    if (!found.data) {
      return res.status(404).json({ error: "activity_not_found" });
    }

    const { data, error } = await supabase
      .from("activities")
      .update({ active: !found.data.active })
      .eq("id", found.data.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data);
  }

  // DELETE
  if (req.method === "DELETE") {
    const found = await findActivityByIdCompat(supabase, id, orgId);

    if (found.error) {
      return res.status(500).json({ error: "lookup_failed" });
    }

    if (!found.data) {
      return res.status(404).json({ error: "activity_not_found" });
    }

    const { error } = await supabase
      .from("activities")
      .delete()
      .eq("id", found.data.id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "method_not_allowed" });
}