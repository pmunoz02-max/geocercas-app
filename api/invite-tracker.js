// api/invite-tracker.js
// App Geocercas (PREVIEW) — Invite Tracker Proxy
// FIX: Supabase Functions gateway requires Authorization header.
// Build: invite-proxy-v17_AUTH_HEADER_FIX_20260223

import crypto from "crypto";

const BUILD_TAG = "invite-proxy-v17_AUTH_HEADER_FIX_20260223";

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

export default async function handler(req, res) {
  try {
    // CORS (por si hay WebView / cross origin)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");

    if (req.method === "OPTIONS") return res.status(200).send("ok");

    const supabaseUrl =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const anonKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Reusa tu secreto de proxy actual (si lo tienes) o uno dedicado
    const proxySecret =
      process.env.INVITE_PROXY_SECRET ||
      process.env.TRACKER_PROXY_SECRET ||
      process.env.PROXY_SECRET;

    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        build: BUILD_TAG,
        route: "/api/invite-tracker",
        diag: {
          hasUrl: !!supabaseUrl,
          hasAnon: !!anonKey,
          hasProxySecret: !!proxySecret,
          supabase_host: safeHost(supabaseUrl),
        },
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, build: BUILD_TAG, error: "Method not allowed" });
    }

    if (!supabaseUrl || !anonKey || !proxySecret) {
      return res.status(500).json({
        ok: false,
        build: BUILD_TAG,
        error: "Server missing env",
        diag: { hasUrl: !!supabaseUrl, hasAnon: !!anonKey, hasProxySecret: !!proxySecret },
      });
    }

    const body = req.body || {};
    const org_id = toStr(body.org_id).trim();
    const invite_id = toStr(body.invite_id).trim(); // opcional (si tu flujo lo usa)
    const email = toStr(body.email).trim().toLowerCase();
    const lang = toStr(body.lang || "es").trim();

    const caller_jwt = toStr(body.caller_jwt).trim();
    if (!caller_jwt) {
      return res.status(401).json({ ok: false, build: BUILD_TAG, error: "Missing caller_jwt" });
    }

    if (!isUuid(org_id)) {
      return res.status(400).json({ ok: false, build: BUILD_TAG, error: "Invalid org_id" });
    }
    if (!email || !email.includes("@")) {
      return res.status(400).json({ ok: false, build: BUILD_TAG, error: "Invalid email" });
    }

    // Firma simple para trazabilidad (opcional, pero permanente)
    const ts = String(Date.now());
    const sig = hmacHex(proxySecret, `${ts}\n${org_id}\n${email}`);

    const edgeUrl =
      `${String(supabaseUrl).replace(/\/$/, "")}` +
      `/functions/v1/send-tracker-invite-brevo`;

    const started = Date.now();
    const upstream = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",

        // ✅ CRÍTICO: requerido por gateway de Supabase Functions
        apikey: String(anonKey),
        Authorization: `Bearer ${anonKey}`,

        // tu auth de app
        "x-user-jwt": caller_jwt,

        // trazabilidad
        "x-edge-ts": ts,
        "x-edge-sig": sig,
        "x-app-lang": lang,
      },
      body: JSON.stringify({ org_id, invite_id, email, lang }),
    });

    const ms = Date.now() - started;
    const text = await upstream.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }

    return res.status(upstream.status).json({
      ...(json || {}),
      _proxy: {
        ok: upstream.ok,
        build: BUILD_TAG,
        edge_url: edgeUrl,
        edge_status: upstream.status,
        edge_ms: ms,
        lang,
        ts,
        sig: sig ? `${sig.slice(0, 4)}***${sig.slice(-4)}` : null,
      },
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      build: BUILD_TAG,
      error: String(e?.message || e),
    });
  }
}