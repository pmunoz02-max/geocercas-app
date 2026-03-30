// api/cost-report.js
// Preview-only API route for tracker cost calculation

import { createClient } from "@supabase/supabase-js";

function getSingleQueryValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseNumericParam(value, fallback = 0) {
  const raw = getSingleQueryValue(value);

  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (process.env.VERCEL_ENV !== "preview") {
    return res.status(403).json({
      ok: false,
      error: "Not available outside preview.",
    });
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed. Use GET.",
    });
  }

  const org_id = getSingleQueryValue(req.query.org_id);
  const date_from = getSingleQueryValue(req.query.date_from);
  const date_to = getSingleQueryValue(req.query.date_to);

  const rate_per_km = parseNumericParam(req.query.rate_per_km, 0);
  const rate_per_hour = parseNumericParam(req.query.rate_per_hour, 0);
  const rate_per_visit = parseNumericParam(req.query.rate_per_visit, 0);

  if (!org_id || !date_from || !date_to) {
    return res.status(400).json({
      ok: false,
      error: "Missing required parameters: org_id, date_from, date_to",
    });
  }

  const SUPABASE_URL = process.env.SUPABASE_PREVIEW_URL;
  const SUPABASE_KEY = process.env.SUPABASE_PREVIEW_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({
      ok: false,
      error: "Preview Supabase credentials not set.",
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data, error } = await supabase.rpc("calculate_tracker_costs_preview", {
      p_org_id: org_id,
      p_date_from: date_from,
      p_date_to: date_to,
      p_rate_per_km: rate_per_km,
      p_rate_per_hour: rate_per_hour,
      p_rate_per_visit: rate_per_visit,
    });

    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message || "RPC error",
      });
    }

    return res.status(200).json({
      ok: true,
      data: data ?? [],
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "Unexpected server error",
    });
  }
}