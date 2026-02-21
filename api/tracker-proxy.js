// api/tracker-proxy.js
// Proxy universal Tracker (PREVIEW/PROD):
// - Forward a Supabase Functions con apikey server-side
// - NO reenvía JWT (evita 401 Invalid JWT del gateway)
// - Server->Edge auth con HMAC (X-Proxy-Signature)
// - Whitelist de funciones
// - Ping por GET para confirmar despliegue real

import crypto from "crypto";

const BUILD_TAG = "tracker-proxy-v5_1-hmac-nojwt-ping-20260220b";

function toStr(v) {
  return String(v ?? "");
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

export default async function handler(req, res) {
  try {
    // CORS básico
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "content-type, authorization, x-proxy-ts, x-proxy-signature"
      );
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      return res.status(200).send("ok");
    }

    // ✅ PING: esto nos confirma qué build está sirviendo Vercel (sin depender del frontend)
    if (req.method === "GET") {
      const supabaseUrl =
        process.env.SUPABASE_URL ||
        process.env.VITE_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL;

      const anonKey =
        process.env.SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const proxySecret = process.env.TRACKER_PROXY_SECRET;

      return res.status(200).json({
        ok: true,
        build_tag: BUILD_TAG,
        route: "/api/tracker-proxy",
        diag: {
          hasUrl: !!supabaseUrl,
          hasAnon: !!anonKey,
          hasProxySecret: !!proxySecret,
          supabase_host: safeHost(supabaseUrl),
        },
      });
    }

    if (req.method !== "POST") {
      return res
        .status(405)
        .json({ ok: false, build_tag: BUILD_TAG, error: "Method not allowed" });
    }

    const supabaseUrl =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const anonKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const proxySecret = process.env.TRACKER_PROXY_SECRET;

    if (!supabaseUrl || !anonKey || !proxySecret) {
      return res.status(500).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "Server missing env",
        diag: {
          hasUrl: !!supabaseUrl,
          hasAnon: !!anonKey,
          hasProxySecret: !!proxySecret,
          supabase_host: safeHost(supabaseUrl),
        },
      });
    }

    const fnName = toStr(req.query?.fn || "").trim();
    if (!isAllowedFn(fnName)) {
      return res.status(400).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "FN_NOT_ALLOWED",
        got: fnName,
        allowed: ["send_position", "accept-tracker-invite"],
      });
    }

    // Mensaje canónico a firmar
    const ts = String(Date.now());
    const bodyStr = JSON.stringify(req.body || {});
    const msg = `${fnName}.${ts}.${bodyStr}`;
    const sig = hmacHex(proxySecret, msg);

    const url =
      String(supabaseUrl).replace(/\/$/, "") + `/functions/v1/${fnName}`;

    // 👇 CRÍTICO: NO reenviamos Authorization al gateway (ni aunque venga del cliente)
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        apikey: String(anonKey),
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
      diag: {
        supabase_host: safeHost(supabaseUrl),
        // solo booleans (no filtramos tokens)
        client_sent_auth: !!req.headers?.authorization,
      },
      ...json,
    });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, build_tag: BUILD_TAG, error: String(e?.message || e) });
  }
}