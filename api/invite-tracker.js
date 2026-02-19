// api/invite-tracker.js
// Proxy robusto (universal):
// - Usa Supabase Functions gateway con ANON como Bearer (siempre aceptado)
// - Pasa JWT real del usuario en x-user-jwt
// - Refresh tg_rt si el upstream devuelve 401 invalid jwt
// - ✅ UNIVERSAL: fallback de Edge Function names (preview/prod pueden diferir)
// - ✅ FIX: edgeBody undefined -> usa req.body

const BUILD_TAG = "invite-proxy-v7-fallback-edgefn-20260219";
const PREVIEW_REF = "mujwsfhkocsuuahlrssn";

// Defaults universales (orden importa):
// 1) invite_tracker (tu prod actual)
// 2) send-tracker-invite-brevo (tu preview histórico)
// 3) send-invite-or-magic (fallback legacy)
// 4) invite-user (legacy)
const DEFAULT_EDGE_FN_CANDIDATES = [
  "invite_tracker",
  "send-tracker-invite-brevo",
  "send-invite-or-magic",
  "invite-user",
];

const SUPPORTED_LANGS = new Set(["es", "en", "fr"]);

function pickLangFromAcceptLanguage(h) {
  const s = String(h || "").toLowerCase();
  if (!s) return "";
  const first = s.split(",")[0].trim();
  return first.slice(0, 2);
}

function sanitizeLang(v) {
  const raw = String(v || "").trim().toLowerCase();
  if (!raw) return "es";
  const two = raw.slice(0, 2);
  return SUPPORTED_LANGS.has(two) ? two : "es";
}

function emailCopyFor(lang) {
  if (lang === "en") {
    return {
      subject: "Invitation: GPS Tracker – App Geofences",
      title: "Invitation to GPS Tracker",
      intro1: "You have been invited to use the GPS Tracker for App Geofences.",
      intro2: "This link will open the Tracker in the correct organization.",
      expires: "This link expires in 7 days.",
      cta: "Open GPS Tracker",
      copyLink: "If you can't click, copy and paste this link:",
    };
  }
  if (lang === "fr") {
    return {
      subject: "Invitation : GPS Tracker – App Geocercas",
      title: "Invitation au GPS Tracker",
      intro1: "Vous avez été invité à utiliser le GPS Tracker d’App Geocercas.",
      intro2: "Ce lien ouvrira le Tracker dans la bonne organisation.",
      expires: "Ce lien expire dans 7 jours.",
      cta: "Ouvrir le GPS Tracker",
      copyLink: "Si vous ne pouvez pas cliquer, copiez et collez ce lien :",
    };
  }
  return {
    subject: "Invitación: Tracker GPS – App Geocercas",
    title: "Invitación a Tracker GPS",
    intro1: "Has sido invitado a usar el Tracker GPS de App Geocercas.",
    intro2: "Este enlace abrirá el Tracker en la organización correcta.",
    expires: "Este enlace expira en 7 días.",
    cta: "Abrir Tracker GPS",
    copyLink: "Si no puedes hacer clic, copia y pega este enlace:",
  };
}

function getCookie(req, name) {
  const raw = req?.headers?.cookie || "";
  const parts = raw.split(";").map((s) => s.trim()).filter(Boolean);
  const hit = parts.find((p) => p.startsWith(name + "="));
  if (!hit) return "";
  const value = hit.split("=").slice(1).join("=");
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeToken(maybeToken) {
  let t = String(maybeToken || "").trim();
  if (!t) return "";
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  )
    t = t.slice(1, -1).trim();
  if (t.startsWith("s:")) t = t.slice(2).trim();
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, "").trim();
  t = t.replace(/\s+/g, "");
  return t;
}

function base64UrlDecode(str) {
  let s = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  return Buffer.from(s, "base64").toString("utf8");
}

function tryDecodeJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return { ok: false, error: "JWT_NOT_3_PARTS" };
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return { ok: true, payload };
  } catch (e) {
    return { ok: false, error: "JWT_DECODE_FAILED", details: String(e?.message || e) };
  }
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function makeCookie(
  name,
  value,
  { maxAgeSec, httpOnly = true, secure = true, sameSite = "Lax", path = "/" }
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    `SameSite=${sameSite}`,
  ];
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  if (typeof maxAgeSec === "number")
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`);
  return parts.join("; ");
}

function parseEdgeFnCandidates() {
  // Permite configurar por env: INVITE_TRACKER_EDGE_FNS="invite_tracker,send-tracker-invite-brevo"
  const raw =
    process.env.INVITE_TRACKER_EDGE_FNS ||
    process.env.NEXT_PUBLIC_INVITE_TRACKER_EDGE_FNS ||
    "";
  const list = String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Uniq + defaults
  const seen = new Set();
  const out = [];
  for (const x of list) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  for (const d of DEFAULT_EDGE_FN_CANDIDATES) {
    if (!seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  return out;
}

async function refreshAccessToken({ supabaseUrl, anonKey, refreshToken }) {
  const url =
    String(supabaseUrl).replace(/\/$/, "") +
    "/auth/v1/token?grant_type=refresh_token";

  const r = await fetch(url, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!r.ok) return { ok: false, status: r.status, body: json };

  const access_token = String(json?.access_token || "");
  const refresh_token = String(json?.refresh_token || "");
  const expires_in = typeof json?.expires_in === "number" ? json.expires_in : null;
  if (!access_token)
    return {
      ok: false,
      status: 500,
      body: { error: "NO_ACCESS_TOKEN_RETURNED", raw: json },
    };

  return { ok: true, access_token, refresh_token, expires_in };
}

function isFunctionNotFound(upstreamStatus, upstreamJson) {
  if (upstreamStatus !== 404) return false;
  const msg = String(upstreamJson?.message || "").toLowerCase();
  const code = String(upstreamJson?.code || "").toUpperCase();
  // Supabase functions gateway suele devolver:
  // { code:"NOT_FOUND", message:"Requested function was not found" }
  return code === "NOT_FOUND" || msg.includes("requested function was not found");
}

function isInvalidJwt401(upstreamStatus, upstreamJson) {
  if (upstreamStatus !== 401) return false;
  const msg = String(upstreamJson?.message || "").toLowerCase();
  const err = String(upstreamJson?.error || "").toLowerCase();
  return msg.includes("invalid jwt") || err.includes("invalid jwt") || upstreamJson?.code === 401;
}

async function callEdge({ supabaseUrl, anonKey, userJwt, fnName, body }) {
  const url =
    String(supabaseUrl).replace(/\/$/, "") + `/functions/v1/${fnName}`;

  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      apikey: anonKey,
      // ✅ Gatekeeper token
      Authorization: `Bearer ${anonKey}`,
      // ✅ Real user token
      "x-user-jwt": userJwt,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });

  const text = await upstream.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  return { status: upstream.status, ok: upstream.ok, json };
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "authorization, x-client-info, apikey, content-type, x-user-jwt"
      );
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      return res.status(200).send("ok");
    }

    if (req.method !== "POST") {
      return res
        .status(405)
        .json({ ok: false, build_tag: BUILD_TAG, error: "Method not allowed" });
    }

    const vercelEnv = String(process.env.VERCEL_ENV || "").toLowerCase();
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return res.status(500).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "Server missing SUPABASE env",
        diag: { vercelEnv, supabaseUrl, hasAnonKey: !!anonKey },
      });
    }

    // Guard: preview debe apuntar al proyecto preview
    if (vercelEnv === "preview" && !String(supabaseUrl).includes(PREVIEW_REF)) {
      return res.status(401).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "PREVIEW_ENV_MISMATCH",
        diag: { vercelEnv, expected_ref: PREVIEW_REF, supabaseUrl },
      });
    }

    const tgAt = normalizeToken(getCookie(req, "tg_at"));
    const tgRt = normalizeToken(getCookie(req, "tg_rt"));

    if (!tgAt) {
      return res.status(401).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "Missing tg_at cookie",
        diag: { vercelEnv, has_tg_rt: !!tgRt, supabaseUrl },
      });
    }

    const d1 = tryDecodeJwt(tgAt);
    const p1 = d1.ok ? d1.payload : null;

    const acceptLang = pickLangFromAcceptLanguage(req?.headers?.["accept-language"]);
    const lang = sanitizeLang(req?.body?.lang || acceptLang);

    // Enriquecemos payload con copy corto (la Edge decide si lo usa)
    const edgeBody = {
      ...(req.body || {}),
      lang,
      email_copy: emailCopyFor(lang),
    };

    const candidates = parseEdgeFnCandidates();

    const diagBase = {
      vercelEnv,
      supabaseUrl,
      iss: p1?.iss || null,
      aud: p1?.aud || null,
      exp: p1?.exp || null,
      now: nowUnix(),
      has_tg_rt: !!tgRt,
      build_tag: BUILD_TAG,
      edge_fn_candidates: candidates,
    };

    // 1) Intento: recorrer functions hasta que una funcione,
    // o hasta que una falle por algo NO-404-notfound (ej RLS/500/400).
    let last = null;
    let usedFn = null;

    for (const fnName of candidates) {
      const r = await callEdge({ supabaseUrl, anonKey, userJwt: tgAt, fnName, body: edgeBody });
      last = r;
      usedFn = fnName;

      if (r.ok) {
        return res.status(200).json({
          build_tag: BUILD_TAG,
          edge_fn: fnName,
          ...r.json,
        });
      }

      // Si no existe esa function, probamos la siguiente
      if (isFunctionNotFound(r.status, r.json)) continue;

      // Si es 401 invalid jwt, intentaremos refresh (una sola vez) para esta fn y/o siguientes
      if (isInvalidJwt401(r.status, r.json)) {
        if (!tgRt) {
          return res.status(401).json({
            ok: false,
            build_tag: BUILD_TAG,
            error: "UPSTREAM_401_NO_REFRESH_TOKEN",
            edge_fn: fnName,
            upstream: r.json,
            diag: { ...diagBase, edge_fn: fnName },
          });
        }

        const refreshed = await refreshAccessToken({ supabaseUrl, anonKey, refreshToken: tgRt });
        if (!refreshed.ok) {
          return res.status(401).json({
            ok: false,
            build_tag: BUILD_TAG,
            error: "REFRESH_FAILED",
            refresh_status: refreshed.status,
            refresh_body: refreshed.body,
            edge_fn: fnName,
            upstream: r.json,
            diag: { ...diagBase, edge_fn: fnName },
          });
        }

        // set cookies
        const cookieHeaders = [];
        cookieHeaders.push(
          makeCookie("tg_at", refreshed.access_token, {
            maxAgeSec: refreshed.expires_in || 3600,
          })
        );
        if (refreshed.refresh_token) {
          cookieHeaders.push(
            makeCookie("tg_rt", refreshed.refresh_token, {
              maxAgeSec: 60 * 60 * 24 * 30,
            })
          );
        }
        res.setHeader("Set-Cookie", cookieHeaders);

        const d2 = tryDecodeJwt(refreshed.access_token);
        const p2 = d2.ok ? d2.payload : null;
        const diag_refreshed = {
          iss: p2?.iss || null,
          aud: p2?.aud || null,
          exp: p2?.exp || null,
          now: nowUnix(),
        };

        // Re-intentar la misma fn primero
        const second = await callEdge({
          supabaseUrl,
          anonKey,
          userJwt: refreshed.access_token,
          fnName,
          body: edgeBody,
        });

        if (second.ok) {
          return res.status(200).json({
            build_tag: BUILD_TAG,
            edge_fn: fnName,
            refreshed: true,
            diag: { ...diagBase, edge_fn: fnName },
            diag_refreshed,
            ...second.json,
          });
        }

        // Si sigue 404 notfound, seguimos con otras functions (con token refrescado)
        if (isFunctionNotFound(second.status, second.json)) {
          // recorrer restantes con token refrescado
          for (const fnName2 of candidates) {
            const rr = await callEdge({
              supabaseUrl,
              anonKey,
              userJwt: refreshed.access_token,
              fnName: fnName2,
              body: edgeBody,
            });

            last = rr;
            usedFn = fnName2;

            if (rr.ok) {
              return res.status(200).json({
                build_tag: BUILD_TAG,
                edge_fn: fnName2,
                refreshed: true,
                diag: { ...diagBase, edge_fn: fnName2 },
                diag_refreshed,
                ...rr.json,
              });
            }

            if (isFunctionNotFound(rr.status, rr.json)) continue;

            return res.status(rr.status).json({
              ok: false,
              build_tag: BUILD_TAG,
              error: "UPSTREAM_ERROR_AFTER_REFRESH",
              refreshed: true,
              edge_fn: fnName2,
              upstream_status: rr.status,
              upstream: rr.json,
              diag: { ...diagBase, edge_fn: fnName2 },
              diag_refreshed,
            });
          }

          // Ninguna existió
          return res.status(404).json({
            ok: false,
            build_tag: BUILD_TAG,
            error: "EDGE_FUNCTION_NOT_FOUND",
            refreshed: true,
            diag: { ...diagBase, edge_fn: null },
            diag_refreshed,
          });
        }

        // Error distinto de notfound
        return res.status(second.status).json({
          ok: false,
          build_tag: BUILD_TAG,
          error: "UPSTREAM_ERROR_AFTER_REFRESH",
          refreshed: true,
          edge_fn: fnName,
          upstream_status: second.status,
          upstream: second.json,
          diag: { ...diagBase, edge_fn: fnName },
          diag_refreshed,
        });
      }

      // Error distinto de notfound/401invalidjwt => devolvemos
      return res.status(r.status).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "UPSTREAM_ERROR",
        edge_fn: fnName,
        upstream_status: r.status,
        upstream: r.json,
        diag: { ...diagBase, edge_fn: fnName },
      });
    }

    // Si llegamos aquí, ninguna function existía
    return res.status(404).json({
      ok: false,
      build_tag: BUILD_TAG,
      error: "EDGE_FUNCTION_NOT_FOUND",
      diag: { ...diagBase, last_edge_fn: usedFn, last_upstream_status: last?.status, last_upstream: last?.json },
    });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, build_tag: BUILD_TAG, error: String(e?.message || e) });
  }
}
