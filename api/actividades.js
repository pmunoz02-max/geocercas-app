import { createClient } from "@supabase/supabase-js";

const VERSION = "actividades-v5-put-update";

function getBearerToken(req) {
  const auth = req.headers?.authorization || req.headers?.Authorization || "";
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

function getCookie(req, name) {
  const cookieHeader = req.headers?.cookie || "";
  if (!cookieHeader) return null;

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join("=") || "");
    }
  }
  return null;
}

function getSupabase(req) {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      global: {
        headers: {
          Authorization: req.headers?.authorization || "",
        },
      },
    }
  );
}

async function resolveContext(req, supabase, requestedOrgId) {
  const cookieToken = getCookie(req, "tg_at");
  const bearerToken = getBearerToken(req);
  const accessToken = cookieToken || bearerToken || null;

  console.log("[ACTIVIDADES AUTH] token sources", {
    hasCookieToken: !!cookieToken,
    hasBearerToken: !!bearerToken,
    hasAccessToken: !!accessToken,
    method: req.method,
    url: req.url,
  });

  if (!accessToken) {
    return {
      errorResponse: {
        status: 401,
        body: { error: "No session token (cookie tg_at or Authorization Bearer)" },
      },
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      errorResponse: {
        status: 401,
        body: { error: "unauthorized" },
      },
    };
  }

  const orgId = requestedOrgId ? String(requestedOrgId).trim() : null;

  if (!orgId) {
    return {
      errorResponse: {
        status: 400,
        body: { error: "missing_org_id" },
      },
    };
  }

  return { orgId, user, errorResponse: null };
}

async function findActivityByIdCompat(supabase, id, orgId) {
  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return { data: null, error };
  if (!data) return { data: null, error: null };

  const rowOrgId = data.org_id ? String(data.org_id) : null;
  const rowTenantId = data.tenant_id ? String(data.tenant_id) : null;
  const wantedOrgId = String(orgId);

  const allowed =
    rowOrgId === wantedOrgId ||
    (rowOrgId == null && rowTenantId === wantedOrgId);

  if (!allowed) return { data: null, error: null };

  return { data, error: null };
}

function parseHourlyCost(value) {
  if (value === "" || value == null) return { ok: false, reason: "invalid_hourly_cost" };
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return { ok: false, reason: "invalid_hourly_cost" };
  if (parsed <= 0) return { ok: false, reason: "hourly_cost_must_be_gt_zero" };
  return { ok: true, value: parsed };
}

export default async function handler(req, res) {
  try {
    res.setHeader("X-Api-Version", VERSION);

    const supabase = getSupabase(req);

    const requestedOrgIdRaw = req.query?.org_id || req.query?.orgId || null;
    const requestedOrgId = requestedOrgIdRaw
      ? String(requestedOrgIdRaw).trim()
      : null;

    const idRaw = typeof req.query?.id === "string" ? req.query.id : null;
    const id = idRaw ? String(idRaw).trim() : null;

    const { orgId, user, errorResponse } = await resolveContext(
      req,
      supabase,
      requestedOrgId
    );

    if (errorResponse) {
      return res.status(errorResponse.status).json(errorResponse.body);
    }

    if (req.method === "POST") {
      const name = String(req.body?.name || "").trim();
      const description = req.body?.description ? String(req.body.description).trim() : null;
      const currency = req.body?.currency ? String(req.body.currency).trim() : "USD";
      const active =
        typeof req.body?.active === "boolean" ? req.body.active : true;

      if (!name) {
        return res.status(400).json({ error: "missing_name" });
      }

      const parsedCost = parseHourlyCost(req.body?.hourly_cost);
      if (!parsedCost.ok) {
        return res.status(400).json({ error: parsedCost.reason });
      }

      const { data: byOrg, error: dupErr1 } = await supabase
        .from("activities")
        .select("id,name")
        .eq("org_id", orgId)
        .ilike("name", name)
        .limit(1);

      const { data: byTenant, error: dupErr2 } = await supabase
        .from("activities")
        .select("id,name")
        .is("org_id", null)
        .eq("tenant_id", orgId)
        .ilike("name", name)
        .limit(1);

      if (dupErr1 || dupErr2) {
        const err = dupErr1 || dupErr2;
        return res.status(500).json({
          error: "activity_duplicate_check_failed",
          message: err?.message || null,
          code: err?.code || null,
          hint: err?.hint || null,
          details: err?.details || null,
        });
      }

      const duplicate = (byOrg && byOrg.length > 0) || (byTenant && byTenant.length > 0);
      if (duplicate) {
        return res.status(409).json({ error: "activity_already_exists" });
      }

      const insertPayload = {
        tenant_id: orgId,
        org_id: orgId,
        name,
        description,
        hourly_rate: parsedCost.value,
        currency_code: currency,
        active,
        created_by: user?.id || null,
      };

      const { data, error } = await supabase
        .from("activities")
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          error: "activity_create_failed",
          message: error?.message || null,
          code: error?.code || null,
          hint: error?.hint || null,
          details: error?.details || null,
        });
      }

      return res.status(201).json({ ok: true, data });
    }

    if (req.method === "GET") {
      const { data: data1, error: error1 } = await supabase
        .from("activities")
        .select("*")
        .eq("org_id", orgId);

      const { data: data2, error: error2 } = await supabase
        .from("activities")
        .select("*")
        .is("org_id", null)
        .eq("tenant_id", orgId);

      if (error1 || error2) {
        const err = error1 || error2;
        return res.status(500).json({
          error: "activities_fetch_failed",
          message: err?.message || null,
          code: err?.code || null,
          hint: err?.hint || null,
          details: err?.details || null,
        });
      }

      const map = new Map();
      for (const row of [...(data1 || []), ...(data2 || [])]) {
        if (row?.id) map.set(String(row.id), row);
      }

      const combined = Array.from(map.values());

      combined.sort((a, b) => {
        const aActive = a?.active ? 1 : 0;
        const bActive = b?.active ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        return String(a?.name || "").localeCompare(String(b?.name || ""));
      });

      return res.status(200).json({ ok: true, data: combined });
    }

    if (req.method === "PUT") {
      if (!id) {
        return res.status(400).json({ error: "missing_id" });
      }

      const found = await findActivityByIdCompat(supabase, id, orgId);

      if (found.error) {
        return res.status(500).json({
          error: "lookup_failed",
          details: found.error.message || null,
        });
      }

      if (!found.data) {
        return res.status(404).json({ error: "activity_not_found" });
      }

      const { name, description, hourly_cost, currency, active } = req.body || {};
      const updatePayload = {};

      if (name !== undefined) {
        const cleanName = String(name || "").trim();
        if (!cleanName) {
          return res.status(400).json({ error: "missing_name" });
        }
        updatePayload.name = cleanName;
      }

      if (description !== undefined) {
        updatePayload.description =
          description == null || String(description).trim() === ""
            ? null
            : String(description).trim();
      }

      if (currency !== undefined) {
        updatePayload.currency_code = String(currency || "").trim() || "USD";
      }

      if (hourly_cost !== undefined) {
        const parsedCost = parseHourlyCost(hourly_cost);
        if (!parsedCost.ok) {
          return res.status(400).json({ error: parsedCost.reason });
        }
        updatePayload.hourly_rate = parsedCost.value;
      }

      if (active !== undefined) {
        updatePayload.active = Boolean(active);
      }

      if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: "empty_update_payload" });
      }

      const { data, error } = await supabase
        .from("activities")
        .update(updatePayload)
        .eq("id", found.data.id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          error: "activity_update_failed",
          message: error?.message || null,
          code: error?.code || null,
          hint: error?.hint || null,
          details: error?.details || null,
        });
      }

      return res.status(200).json({ ok: true, data });
    }

    if (req.method === "PATCH") {
      const found = await findActivityByIdCompat(supabase, id, orgId);

      if (found.error) {
        return res.status(500).json({
          error: "lookup_failed",
          details: found.error.message || null,
        });
      }

      if (!found.data) {
        return res.status(404).json({ error: "activity_not_found" });
      }

      const nextActive =
        typeof req.body?.active === "boolean" ? req.body.active : !found.data.active;

      const { data, error } = await supabase
        .from("activities")
        .update({ active: nextActive })
        .eq("id", found.data.id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          error: error.message,
          code: error.code || null,
          hint: error.hint || null,
          details: error.details || null,
        });
      }

      return res.status(200).json({ ok: true, data });
    }

    if (req.method === "DELETE") {
      const found = await findActivityByIdCompat(supabase, id, orgId);

      if (found.error) {
        return res.status(500).json({
          error: "lookup_failed",
          details: found.error.message || null,
        });
      }

      if (!found.data) {
        return res.status(404).json({ error: "activity_not_found" });
      }

      const { error } = await supabase
        .from("activities")
        .delete()
        .eq("id", found.data.id);

      if (error) {
        return res.status(500).json({
          error: error.message,
          code: error.code || null,
          hint: error.hint || null,
          details: error.details || null,
        });
      }

      return res.status(200).json({ ok: true, data: { success: true } });
    }

    return res.status(405).json({ error: "method_not_allowed" });
  } catch (e) {
    console.error("[ACTIVIDADES FATAL]", {
      message: e?.message || String(e),
      stack: e?.stack || null,
    });

    return res.status(500).json({
      error: "activities_fatal_error",
      message: e?.message || "unknown_error",
    });
  }
}