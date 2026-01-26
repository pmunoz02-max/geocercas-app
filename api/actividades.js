// api/actividades.js
//
// Actividades API (multi-tenant) - FIX DEFINITIVO
// Problema raíz: app.tenant_id (GUC) NO persiste entre llamadas Supabase (cada .rpc/.from es una request distinta).
// Solución universal/permanente: TODA lectura/escritura de activities se hace vía RPC que:
// - resuelve org_id (tenant) en DB
// - setea app.tenant_id dentro de ESA misma transacción
// - ejecuta el SELECT/INSERT/UPDATE/DELETE y retorna
//
// Auth por cookie HttpOnly: tg_at
// Frontend NO envía org_id.

import { createClient } from "@supabase/supabase-js";

const API_VERSION = "actividades-api-2026-01-26-r4-rpc-only";

function json(res, status, payload) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-API-Version", API_VERSION);
  res.end(JSON.stringify({ ...payload, api_version: API_VERSION }));
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

function buildSupabaseForUser(accessToken) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars");

  return createClient(url, anon, {
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function getSupabase(req) {
  const accessToken = getCookie(req, "tg_at");
  if (!accessToken) return { ok: false, status: 401, error: "No session cookie (tg_at)" };

  const supabase = buildSupabaseForUser(accessToken);

  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData?.user) return { ok: false, status: 401, error: "Invalid session" };

  return { ok: true, status: 200, supabase, user: userData.user };
}

export default async function handler(req, res) {
  try {
    const ctx = await getSupabase(req);
    if (!ctx.ok) return json(res, ctx.status, { ok: false, error: ctx.error });

    const { supabase } = ctx;
    const id = typeof req.query?.id === "string" ? req.query.id : null;

    // ---------- GET ----------
    if (req.method === "GET") {
      const includeInactive = req.query?.includeInactive === "true" || req.query?.includeInactive === "1";

      const { data, error } = await supabase.rpc("activities_list", {
        p_include_inactive: includeInactive,
      });

      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true, data: data || [] });
    }

    // ---------- POST ----------
    if (req.method === "POST") {
      const body = safeJson(req.body);
      const name = String(body?.name || "").trim();
      if (!name) return json(res, 400, { ok: false, error: "Missing name" });

      const { data, error } = await supabase.rpc("activities_create", {
        p_name: name,
        p_description: body?.description ?? null,
        p_active: body?.active ?? true,
        p_currency_code: body?.currency_code ?? "USD",
        p_hourly_rate: body?.hourly_rate ?? null,
      });

      if (error) return json(res, 400, { ok: false, error: error.message });
      const row = Array.isArray(data) ? data[0] : data;
      return json(res, 201, { ok: true, data: row });
    }

    // Requiere id para PUT/PATCH/DELETE
    if (!id) return json(res, 400, { ok: false, error: "Missing id query param (?id=...)" });

    // ---------- PUT ----------
    if (req.method === "PUT") {
      const body = safeJson(req.body);
      const patchName = body?.name !== undefined ? String(body.name).trim() : null;
      if (body?.name !== undefined && !patchName) return json(res, 400, { ok: false, error: "Invalid name" });

      const { data, error } = await supabase.rpc("activities_update", {
        p_id: id,
        p_name: body?.name !== undefined ? patchName : null,
        p_description: body?.description !== undefined ? (body.description || null) : null,
        p_currency_code: body?.currency_code !== undefined ? (body.currency_code || "USD") : null,
        p_hourly_rate: body?.hourly_rate !== undefined ? body.hourly_rate : null,
      });

      if (error) return json(res, 400, { ok: false, error: error.message });
      const row = Array.isArray(data) ? data[0] : data;
      return json(res, 200, { ok: true, data: row });
    }

    // ---------- PATCH (active) ----------
    if (req.method === "PATCH") {
      const body = safeJson(req.body);
      const active = Boolean(body?.active);

      const { data, error } = await supabase.rpc("activities_set_active", {
        p_id: id,
        p_active: active,
      });

      if (error) return json(res, 400, { ok: false, error: error.message });
      const row = Array.isArray(data) ? data[0] : data;
      return json(res, 200, { ok: true, data: row });
    }

    // ---------- DELETE ----------
    if (req.method === "DELETE") {
      const { data, error } = await supabase.rpc("activities_delete", { p_id: id });
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true, data });
    }

    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("[api/actividades] fatal:", e);
    return json(res, 500, { ok: false, error: e?.message || "Server error" });
  }
}
