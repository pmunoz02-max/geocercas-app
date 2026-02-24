// api/tracker-proxy.js
// Proxy universal Tracker (PROD/PREVIEW)
// v7: forward real user JWT; fallback to service role if missing; safe text/json handling

import crypto from "crypto";

const BUILD_TAG = "tracker-proxy-v7_forward_jwt_service_fallback_20260224";

function toStr(v) {
  return String(v ?? "");
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

function isAllowedFn(fnName) {
  // solo lo estrictamente necesario
  return fnName === "send_position" || fnName === "accept-tracker-invite";
}

async function readUpstreamBody(upstream) {
  const text = await upstream.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
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

    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const proxySecret = process.env.TRACKER_PROXY_SECRET || process.env.PROXY_SECRET;

    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        build_tag: BUILD_TAG,
        diag: {
          hasUrl: !!supabaseUrl,
          hasAnon: !!anonKey,
          hasServiceRole: !!serviceRole,
          hasProxySecret: !!proxySecret,
          supabase_host: safeHost(supabaseUrl),
        },
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, build_tag: BUILD_TAG });
    }

    if (!supabaseUrl || !anonKey || !proxySecret) {
      return res.status(500).json({ ok: false, build_tag: BUILD_TAG, error: "Missing env" });
    }

    const fnName = toStr(req.query?.fn || "").trim();
    if (!isAllowedFn(fnName)) {
      return res.status(400).json({ ok: false, build_tag: BUILD_TAG, error: "FN_NOT_ALLOWED" });
    }

    const body = req.body || {};

    // ✅ JWT real del usuario (lo que evita issuer mismatch / invalid jwt)
    const userJwt = getBearer(req);

    // Fallback: si no viene JWT del usuario, usamos service role (solo si existe)
    const bearer =
      userJwt
        ? `Bearer ${userJwt}`
        : (serviceRole ? `Bearer ${serviceRole}` : null);

    if (!bearer) {
      return res.status(401).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "Missing Authorization and no service role fallback",
      });
    }

    const ts = String(Date.now());
    const bodyStr = JSON.stringify(body);
    const msg = `${fnName}.${ts}.${bodyStr}`;
    const sig = hmacHex(proxySecret, msg);

    const url = String(supabaseUrl).replace(/\/$/, "") + `/functions/v1/${fnName}`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        apikey: String(anonKey),
        Authorization: bearer,
        "Content-Type": "application/json",
        "X-Proxy-Ts": ts,
        "X-Proxy-Signature": sig,
      },
      body: bodyStr,
    });

    const payload = await readUpstreamBody(upstream);

    return res.status(upstream.status).json({
      build_tag: BUILD_TAG,
      fn: fnName,
      upstream_status: upstream.status,
      ...(payload ?? {}),
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      build_tag: BUILD_TAG,
      error: String(e?.message || e),
    });
  }
}