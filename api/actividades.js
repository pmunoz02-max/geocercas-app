// api/actividades.js
//
// Actividades API (multi-tenant) — UNIVERSAL & PERMANENTE (Feb 2026)
// ✅ Auth universal: Bearer token (preferido) o cookie HttpOnly: tg_at (legacy)
// ✅ Membership universal: public.memberships (revoked_at IS NULL) via resolveOrgAndMembership()
// ✅ Org segura: x-org-id (si viene) o default/fallback desde memberships
// ✅ RPC-only: mantiene tu enfoque, pero ahora con org_id resuelto en el servidor
//
// Compatibilidad:
// - Si las RPC NO aceptan p_org_id, usamos fallback a la firma actual (sin romper)
// - Frontend NO necesita enviar org_id

import { createClient } from "@supabase/supabase-js";
import { resolveOrgAndMembership } from "../src/server/lib/resolveOrg.js";

export const config = { runtime: "nodejs" };

const API_VERSION = "actividades-api-2026-02-07-r5-memberships-rpc";

function json(res, status, payload) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-API-Version", API_VERSION);
  res.end(JSON.stringify({ ...payload, api_version: API_VERSION }));
}

function parseCookies(req) {
  const header = req.headers?.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    try {
      out[k] = decodeURIComponent(rest.join("=") || "");
    } catch {
      out[k] = rest.join("=") || "";
    }
  });
  return out;
}

function getBearerToken(req) {
  const h = String(req.headers?.authorization || req.headers?.Authorization || "").trim();
  if (!h) return "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || "").trim() : "";
}

function getAccessToken(req) {
  const bearer = getBearerToken(req);
  if (bearer) return bearer;
  const cookies = parseCookies(req);
  return cookies.tg_at || "";
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
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

function isMissingColumnOrParam(err, needle) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes(String(needle).toLowerCase()) && (msg.includes("does not exist") || msg.includes("unknown"));
}

async function callRpcWithOptionalOrg(sb, fn, args, orgId) {
  // Intento 1: con p_org_id
  const withOrg = { ...args, p_org_id: orgId };
  let r = await sb.rpc(fn, withOrg);

  // Fallback: si la función no acepta p_org_id, llamar con firma antigua
  if (r?.error && isMissingColumnOrParam(r.error, "p_org_id")) {
    r = await sb.rpc(fn, args);
  }

  return r;
}

export default async function handler(req, res) {
  const build_tag = "actividades-v2026-02-memberships-rpc";

  try {
    const SUPABASE_URL = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
    const SUPABASE_ANON_KEY = getEnv(["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
    const SUPABASE_SERVICE_ROLE_KEY = getEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"]);

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(res, 500, {
        ok: false,
        build_tag,
        error: "Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    // ===== AUTH =====
    const accessToken = getAccessToken(req);
    if (!accessToken) return json(res, 401, { ok: false, build_tag, error: "Missing authentication" });

    // ===== ADMIN (para validar user + memberships) =====
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
    const user = userData?.user || null;
    if (userErr || !user) return json(res, 401, { ok: false, build_tag, error: "Invalid session" });

    const requestedOrgId = req.headers["x-org-id"] ? String(req.headers["x-org-id"]) : "";
    const membership = await resolveOrgAndMembership(admin, user.id, requestedOrgId);

    if (!membership?.org_id) {
      return json(res, 403, { ok: false, build_tag, error: "User not member of organization" });
    }

    const orgId = membership.org_id;

    // ===== USER CLIENT (RPC con RLS como usuario) =====
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const id = typeof req.query?.id === "string" ? req.query.id : null;

    // ---------- GET ----------
    if (req.method === "GET") {
      const includeInactive = req.query?.includeInactive === "true" || req.query?.includeInactive === "1";

      const { data, error } = await callRpcWithOptionalOrg(
        supabase,
        "activities_list",
        { p_include_inactive: includeInactive },
        orgId
      );

      if (error) return json(res, 400, { ok: false, build_tag, error: error.message });
      return json(res, 200, { ok: true, org_id: orgId, data: data || [] });
    }

    // ---------- POST ----------
    if (req.method === "POST") {
      const body = safeJson(req.body);
      const name = String(body?.name || "").trim();
      if (!name) return json(res, 400, { ok: false, build_tag, error: "Missing name" });

      const { data, error } = await callRpcWithOptionalOrg(
        supabase,
        "activities_create",
        {
          p_name: name,
          p_description: body?.description ?? null,
          p_active: body?.active ?? true,
          p_currency_code: body?.currency_code ?? "USD",
          p_hourly_rate: body?.hourly_rate ?? null,
        },
        orgId
      );

      if (error) return json(res, 400, { ok: false, build_tag, error: error.message });
      const row = Array.isArray(data) ? data[0] : data;
      return json(res, 201, { ok: true, org_id: orgId, data: row });
    }

    // Requiere id para PUT/PATCH/DELETE
    if (!id) return json(res, 400, { ok: false, build_tag, error: "Missing id query param (?id=...)" });

    // ---------- PUT ----------
    if (req.method === "PUT") {
      const body = safeJson(req.body);
      const patchName = body?.name !== undefined ? String(body.name).trim() : null;
      if (body?.name !== undefined && !patchName) return json(res, 400, { ok: false, build_tag, error: "Invalid name" });

      const { data, error } = await callRpcWithOptionalOrg(
        supabase,
        "activities_update",
        {
          p_id: id,
          p_name: body?.name !== undefined ? patchName : null,
          p_description: body?.description !== undefined ? (body.description || null) : null,
          p_currency_code: body?.currency_code !== undefined ? (body.currency_code || "USD") : null,
          p_hourly_rate: body?.hourly_rate !== undefined ? body.hourly_rate : null,
        },
        orgId
      );

      if (error) return json(res, 400, { ok: false, build_tag, error: error.message });
      const row = Array.isArray(data) ? data[0] : data;
      return json(res, 200, { ok: true, org_id: orgId, data: row });
    }

    // ---------- PATCH (active) ----------
    if (req.method === "PATCH") {
      const body = safeJson(req.body);
      const active = Boolean(body?.active);

      const { data, error } = await callRpcWithOptionalOrg(
        supabase,
        "activities_set_active",
        { p_id: id, p_active: active },
        orgId
      );

      if (error) return json(res, 400, { ok: false, build_tag, error: error.message });
      const row = Array.isArray(data) ? data[0] : data;
      return json(res, 200, { ok: true, org_id: orgId, data: row });
    }

    // ---------- DELETE ----------
    if (req.method === "DELETE") {
      const { data, error } = await callRpcWithOptionalOrg(supabase, "activities_delete", { p_id: id }, orgId);
      if (error) return json(res, 400, { ok: false, build_tag, error: error.message });
      return json(res, 200, { ok: true, org_id: orgId, data });
    }

    return json(res, 405, { ok: false, build_tag, error: "Method not allowed" });
  } catch (e) {
    console.error("[api/actividades] fatal:", e);
    return json(res, 500, { ok: false, build_tag: "actividades-v2026-02-memberships-rpc", error: e?.message || "Server error" });
  }
}
