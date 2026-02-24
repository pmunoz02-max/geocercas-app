// pages/api/tracker-proxy.js
// Next.js Pages Router API Route
// tracker-proxy v9.1 (NodeJS runtime, no-crash diagnostic, strict allowlist, raw-body forward)

export const config = {
  api: {
    bodyParser: false, // necesitamos raw body
    externalResolver: true,
  },
};

const crypto = require('crypto');

const BUILD_TAG = 'tracker-proxy-v9.1_pages_api_nodejs_20260224';

function sendJson(res, status, obj, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  Object.entries(extraHeaders).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(obj));
}

function hostOf(url) {
  try { return new URL(String(url)).host; } catch { return ''; }
}

function hmacHex(secret, msg) {
  return crypto.createHmac('sha256', secret).update(msg).digest('hex');
}

const ALLOW = new Set(['send_position', 'accept-tracker-invite']);

function normalizeFn(fn) {
  const raw = String(fn || '').trim();
  const map = {
    'accept-tracker-invite': 'accept-tracker-invite',
    'accept_tracker_invite': 'accept-tracker-invite',
    'acceptTrackerInvite': 'accept-tracker-invite',
    'send_position': 'send_position',
    'send-position': 'send_position',
  };
  return map[raw] || raw;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, x-tracker-ts, x-tracker-nonce, x-tracker-sig',
  };
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  try {
    if (req.method === 'OPTIONS') {
      Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
      res.statusCode = 200;
      return res.end('ok');
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SB_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SB_SERVICE_ROLE;
    const PROXY_SECRET = process.env.TRACKER_PROXY_SECRET || process.env.PROXY_SECRET || '';

    if (req.method === 'GET') {
      return sendJson(
        res,
        200,
        {
          ok: true,
          build_tag: BUILD_TAG,
          diag: {
            hasUrl: !!SUPABASE_URL,
            hasAnon: !!SUPABASE_ANON_KEY,
            hasProxySecret: !!PROXY_SECRET,
            hasServiceRole: !!SERVICE_ROLE,
            supabase_host: hostOf(SUPABASE_URL),
            node: process.version,
          },
        },
        corsHeaders(origin),
      );
    }

    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, build_tag: BUILD_TAG, error: 'METHOD_NOT_ALLOWED' }, corsHeaders(origin));
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !PROXY_SECRET) {
      return sendJson(
        res,
        500,
        {
          ok: false,
          build_tag: BUILD_TAG,
          error: 'MISSING_ENV',
          diag: {
            hasUrl: !!SUPABASE_URL,
            hasAnon: !!SUPABASE_ANON_KEY,
            hasProxySecret: !!PROXY_SECRET,
            hasServiceRole: !!SERVICE_ROLE,
          },
        },
        corsHeaders(origin),
      );
    }

    const fnRaw = req.query?.fn;
    if (!fnRaw) {
      return sendJson(res, 400, { ok: false, build_tag: BUILD_TAG, error: 'MISSING_FN' }, corsHeaders(origin));
    }

    const fn = normalizeFn(fnRaw);
    if (!ALLOW.has(fn)) {
      return sendJson(res, 400, { ok: false, build_tag: BUILD_TAG, error: 'FN_NOT_ALLOWED', fn_in: fnRaw, fn_canon: fn }, corsHeaders(origin));
    }

    const rawBody = await readRawBody(req);

    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const msg = `${ts}.${nonce}.${rawBody}`;
    const sig = hmacHex(PROXY_SECRET, msg);

    const auth = req.headers.authorization;
    let upstreamAuth = auth;
    if (!upstreamAuth) {
      if (!SERVICE_ROLE) {
        return sendJson(res, 401, { ok: false, build_tag: BUILD_TAG, error: 'NO_AUTH_AND_NO_SERVICE_ROLE' }, corsHeaders(origin));
      }
      upstreamAuth = `Bearer ${SERVICE_ROLE}`;
    }

    const upstreamUrl = String(SUPABASE_URL).replace(/\/$/, '') + `/functions/v1/${fn}`;

    const upstreamResp = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        apikey: String(SUPABASE_ANON_KEY),
        authorization: upstreamAuth,
        'content-type': 'application/json',
        'x-tracker-ts': ts,
        'x-tracker-nonce': nonce,
        'x-tracker-sig': sig,
      },
      body: rawBody,
    });

    const text = await upstreamResp.text();
    let payload;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text ? { raw: text } : null; }

    return sendJson(
      res,
      upstreamResp.status,
      {
        build_tag: BUILD_TAG,
        fn_in: String(fnRaw),
        fn,
        upstream_status: upstreamResp.status,
        ...(payload || {}),
      },
      corsHeaders(origin),
    );
  } catch (e) {
    return sendJson(res, 500, { ok: false, build_tag: BUILD_TAG, error: String(e?.message || e) }, corsHeaders(origin));
  }
}
