// api/actividades.js

import { createClient } from "@supabase/supabase-js";

const VERSION = "actividades-api-v3-hourly-rate-fix";

/* =========================
   Headers + helpers
========================= */

function setHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Cookie");
  res.setHeader("X-Api-Version", VERSION);
}

function json(res, status, payload) {
  setHeaders(res);
  res.statusCode = status;
  res.end(JSON.stringify({ ...payload, version: VERSION }));
}

function getCookie(req, name) {
  const header = req.headers?.cookie || "";
  const parts = header.split(";").map((p) => p.trim());
  const found = parts.find((p) => p.startsWith(`${name}=`));
  if (!found) return null;
  return decodeURIComponent(found.slice(name.length + 1));
}

function safeJson(x) {
  if (!x) return {};
  if (typeof x === "object") return x;
  try {
    return JSON.parse(x);
  } catch {
    return {};
  }
}

function getEnv(nameList) {
  for (const n of nameList) {
    const v = process.env[n];
    if (v) return v;
  }
  return null;
}

/* =========================
   Supabase client
========================= */

function buildSupabase(accessToken) {
  const url = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
  const anon = getEnv(["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"]);

  return createClient(url, anon, {
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  });
}

/* =========================
   Handler
========================= */

export default async function handler(req, res) {
  try {
    const orgId = req.query?.org_id;

    if (!orgId) {
      return json(res, 400, { error: "missing_org_id" });
    }

    const accessToken = getCookie(req, "tg_at");
    const supabase = buildSupabase(accessToken);

    // ---------- POST ----------
    if (req.method === "POST") {
      const body = safeJson(req.body);
      const name = String(body?.name || "").trim();

      if (!name) {
        return json(res, 400, { error: "missing_name" });
      }

      // 🔥 FIX CLAVE: normalizar hourly_rate
      const rawHourlyRate = body?.hourly_rate;
      let hourlyRate = null;

      if (
        rawHourlyRate !== undefined &&
        rawHourlyRate !== null &&
        rawHourlyRate !== ""
      ) {
        const n = Number(rawHourlyRate);

        if (!Number.isFinite(n)) {
          return json(res, 400, { error: "invalid_hourly_rate" });
        }

        hourlyRate = n;
      }

      // 🔥 FIX: created_by requerido
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      const payload = {
        tenant_id: orgId,
        org_id: orgId,
        name,
        description: body?.description ?? null,
        active: body?.active ?? true,
        currency_code: body?.currency_code ?? "USD",
        hourly_rate: hourlyRate,
        created_by: userId,
      };

      const { data, error } = await supabase
        .from("activities")
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        return json(res, 500, {
          error: "activities_create_failed",
          details: error.message,
          code: error.code,
          hint: error.hint,
          debug: {
            hourly_rate: hourlyRate,
            type: typeof hourlyRate,
            userId,
          },
        });
      }

      return json(res, 201, { data });
    }

    // ---------- GET ----------
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("org_id", orgId);

      if (error) {
        return json(res, 500, {
          error: "activities_list_failed",
          details: error.message,
        });
      }

      return json(res, 200, { data });
    }

    return json(res, 405, { error: "method_not_allowed" });

  } catch (e) {
    return json(res, 500, {
      error: "server_error",
      details: e.message,
    });
  }
}