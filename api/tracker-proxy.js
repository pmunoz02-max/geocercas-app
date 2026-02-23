// api/tracker-proxy.js
// Proxy universal Tracker (PREVIEW)
// FIX: ahora envía Authorization Bearer anonKey al llamar a Supabase Functions

import crypto from "crypto";

const BUILD_TAG = "tracker-proxy-v6_auth-header_fix_20260223";

function toStr(v) {
  return String(v ?? "");
}

function isUuid(v) {
  const s = toStr(v).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function isAllowedFn(fnName) {
  return fnName === "send_position" || fnName === "accept-tracker-invite";
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

function getBearer(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return (m?.[1] || "").trim();
}

async function getUserIdFromToken({ supabaseUrl, anonKey, jwt }) {
  const r = await fetch(`${String(supabaseUrl).replace(/\/$/, "")}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: String(anonKey),
      Authorization: `Bearer ${jwt}`,
    },
  });

  if (!r.ok) return { ok: false, status: r.status };
  const j = await r.json().catch(() => null);
  const userId = j?.id || null;
  return userId ? { ok: true, userId } : { ok: false, status: 500 };
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "content-type, authorization, x-proxy-ts, x-proxy-signature"
      );
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      return res.status(200).send("ok");
    }

    if (req.method === "GET") {
      const supabaseUrl = process.env.SUPABASE_URL;
      const anonKey = process.env.SUPABASE_ANON_KEY;
      const proxySecret = process.env.TRACKER_PROXY_SECRET;

      return res.status(200).json({
        ok: true,
        build_tag: BUILD_TAG,
        diag: {
          hasUrl: !!supabaseUrl,
          hasAnon: !!anonKey,
          hasProxySecret: !!proxySecret,
          supabase_host: safeHost(supabaseUrl),
        },
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, build_tag: BUILD_TAG });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const proxySecret = process.env.TRACKER_PROXY_SECRET;

    if (!supabaseUrl || !anonKey || !proxySecret) {
      return res.status(500).json({ ok: false, build_tag: BUILD_TAG, error: "Missing env" });
    }

    const fnName = toStr(req.query?.fn || "").trim();

    if (!isAllowedFn(fnName)) {
      return res.status(400).json({ ok: false, build_tag: BUILD_TAG, error: "FN_NOT_ALLOWED" });
    }

    let body = req.body || {};

    if (fnName === "send_position") {
      const qOrg = toStr(req.query?.org_id || "").trim();
      const bOrg = toStr(body?.org_id || "").trim();
      const org_id = isUuid(qOrg) ? qOrg : (isUuid(bOrg) ? bOrg : "");

      if (!org_id) {
        return res.status(400).json({ ok: false, build_tag: BUILD_TAG, error: "org_id required" });
      }

      body = { ...body, org_id };

      const jwt = getBearer(req);
      if (jwt) {
        const u = await getUserIdFromToken({ supabaseUrl, anonKey, jwt });
        if (u.ok) body.user_id = u.userId;
      }
    }

    const ts = String(Date.now());
    const bodyStr = JSON.stringify(body);
    const msg = `${fnName}.${ts}.${bodyStr}`;
    const sig = hmacHex(proxySecret, msg);

    const url =
      String(supabaseUrl).replace(/\/$/, "") + `/functions/v1/${fnName}`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        apikey: String(anonKey),
        Authorization: `Bearer ${anonKey}`, // ✅ FIX CRÍTICO
        "Content-Type": "application/json",
        "X-Proxy-Ts": ts,
        "X-Proxy-Signature": sig,
      },
      body: bodyStr,
    });

    const text = await upstream.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }

    return res.status(upstream.status).json({
      build_tag: BUILD_TAG,
      fn: fnName,
      upstream_status: upstream.status,
      ...json,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      build_tag: BUILD_TAG,
      error: String(e?.message || e),
    });
  }
}