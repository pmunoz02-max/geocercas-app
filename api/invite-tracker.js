/*
INVITE-TRACKER FLOW DOCUMENTATION
---------------------------------
PREVIEW ONLY

Este endpoint proxy crea invitaciones de tracker y solo devuelve un link
si el upstream retorna evidencia de una fila real creada en tracker_invites.

Contrato de éxito:
- invite_id
- created_at
- invite_url

Si falta cualquiera de esos campos, el endpoint falla y NO devuelve invite_url.
*/

// api/invite-tracker.js
// App Geocercas (PREVIEW) — Invite Tracker Proxy
// BUILD: invite-proxy-v19_REAL_INVITE_ROW_REQUIRED_20260413

import crypto from "crypto";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const BUILD_TAG = "invite-proxy-v19_REAL_INVITE_ROW_REQUIRED_20260413";

async function resolveUserIdByEmail({ email, serviceKey, supabaseUrl }) {
  const perPage = 200;
  const maxPages = 20;
  const emailLc = String(email || "").toLowerCase().trim();

  for (let page = 1; page <= maxPages; page++) {
    const url = `${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=${perPage}&email=${encodeURIComponent(emailLc)}`;
    const resp = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });

    if (!resp.ok) break;

    const data = await resp.json();
    const users = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
    const match = users.find((u) => String(u?.email || "").toLowerCase() === emailLc);
    if (match?.id) return match.id;

    if (!users.length || users.length < perPage) break;
  }

  return null;
}

function safeHost(url) {
  try {
    return new URL(String(url)).host;
  } catch {
    return "";
  }
}

function hmacHex(secret, msg) {
  return crypto.createHmac("sha256", secret).update(msg).digest("hex");
}

function toStr(v) {
  return String(v ?? "");
}

function isUuid(v) {
  const s = toStr(v).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function hasForbiddenMagicMarkers(url) {
  const s = toStr(url).toLowerCase();
  if (!s) return false;

  return (
    s.includes("/auth/callback") ||
    s.includes("token_hash") ||
    s.includes("magiclink") ||
    s.includes("type=magiclink")
  );
}

function parseTrackerInviteUrl(url) {
  const s = toStr(url).trim();
  if (!s) return { valid: false, reason: "URL vacía" };

  try {
    let urlObj;
    try {
      urlObj = new URL(s);
    } catch {
      urlObj = new URL(s, "https://dummy.local");
    }

    const validPaths = ["/tracker-accept", "/accept-invite"];
    if (!validPaths.includes(urlObj.pathname)) {
      return {
        valid: false,
        reason: "Path inválido",
        url: s,
        pathname: urlObj.pathname,
      };
    }

    const params = new URLSearchParams(urlObj.search);

    if (urlObj.hash && urlObj.hash.startsWith("#")) {
      const hashParams = new URLSearchParams(urlObj.hash.slice(1));
      for (const [k, v] of hashParams.entries()) {
        if (!params.has(k)) params.set(k, v);
      }
    }

    const org_id = params.get("org_id") || params.get("org") || params.get("orgId");
    const access_token =
      params.get("access_token") ||
      params.get("token") ||
      params.get("token_hash") ||
      params.get("invite_token");

    console.log("[invite-tracker] invite_url recibida", {
      url: s,
      org_id,
      access_token_prefix: access_token ? String(access_token).slice(0, 8) : null,
      params: Object.fromEntries(params.entries()),
    });

    if (!org_id && !access_token) {
      return {
        valid: false,
        reason: "Faltan parámetros esenciales",
        url: s,
        org_id,
        access_token,
        params: Object.fromEntries(params.entries()),
      };
    }

    return {
      valid: true,
      url: s,
      org_id,
      access_token,
      params: Object.fromEntries(params.entries()),
    };
  } catch (e) {
    return {
      valid: false,
      reason: "URL inválida",
      error: String(e),
      url: s,
    };
  }
}

function pickInviteUrlFromUpstream(json) {
  const candidates = [json?.invite_url, json?.inviteUrl, json?.action_link, json?.redirect_to];
  for (const c of candidates) {
    const s = toStr(c).trim();
    if (s) return s;
  }
  return "";
}

function pickInviteIdFromUpstream(json) {
  return (
    toStr(json?.invite_id).trim() ||
    toStr(json?.invite?.id).trim() ||
    toStr(json?.id).trim() ||
    ""
  );
}

function pickCreatedAtFromUpstream(json) {
  return (
    toStr(json?.created_at).trim() ||
    toStr(json?.invite?.created_at).trim() ||
    ""
  );
}


export default async function handler(req, res) {
  try {
    const { org_id, email } = req.body || {}

    if (!org_id || !email) {
      return res.status(400).json({
        ok: false,
        error: "missing_org_id_or_email",
      })
    }

    // 1. Extract user JWT from request
    const userJwt =
      req.headers["x-user-jwt"] ||
      (req.headers.authorization || "").replace("Bearer ", "");

    const edgeUrl = `${process.env.SUPABASE_URL}/functions/v1/send-tracker-invite-brevo`

    // 2. Forward userJwt as x-user-jwt header to Edge Function
    const upstreamRes = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "x-user-jwt": userJwt,
      },
      body: JSON.stringify({ org_id, email }),
    })

    const upstreamText = await upstreamRes.text()

    let upstreamJson = null
    try {
      upstreamJson = upstreamText ? JSON.parse(upstreamText) : null
    } catch (_) {
      upstreamJson = null
    }

    // 🔴 ERROR
    if (!upstreamRes.ok) {
      console.error("[api/invite-tracker] upstream failed", {
        status: upstreamRes.status,
        body: upstreamText,
      })

      return res.status(upstreamRes.status).json({
        ok: false,
        error: upstreamJson?.error || "invite_upstream_failed",
        upstream_status: upstreamRes.status,
        upstream_body: upstreamJson || upstreamText || null,
      })
    }

    // 🟢 SUCCESS
    return res.status(200).json({
      ok: true,
      ...(upstreamJson || {}),
    })
  } catch (err) {
    console.error("[api/invite-tracker] fatal", err)

    return res.status(500).json({
      ok: false,
      error: "invite_internal_error",
      message: err?.message || String(err),
    })
  }
}