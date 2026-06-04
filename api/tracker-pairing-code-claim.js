import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

const DEFAULT_RUNTIME_EXPIRES_HOURS = 720;
const MAX_RUNTIME_EXPIRES_HOURS = 24 * 90;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function json(res, status, payload) {
  setCors(res);
  return res.status(status).json(payload);
}

function getHeader(req, name) {
  return req.headers?.[name] || req.headers?.[name.toLowerCase()] || "";
}

function getCookie(req, name) {
  const raw = getHeader(req, "cookie");
  if (!raw) return "";
  const parts = String(raw).split(";").map((part) => part.trim());
  const found = parts.find((part) => part.startsWith(`${name}=`));
  if (!found) return "";
  return decodeURIComponent(found.slice(name.length + 1));
}

function getAccessToken(req) {
  const auth = getHeader(req, "authorization");
  const bearer = String(auth || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || getCookie(req, "tg_at") || "";
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }

  return await new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function normalizePositiveInt(value, fallback, maxValue) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, maxValue);
}

function normalizePairingCode(code) {
  return String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function supabaseAnonWithToken(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function supabaseService() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return json(res, 405, {
      ok: false,
      error: "method_not_allowed",
    });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 500, {
      ok: false,
      error: "server_env_missing",
    });
  }

  const accessToken = getAccessToken(req);

  if (!accessToken) {
    return json(res, 401, {
      ok: false,
      error: "missing_auth",
    });
  }

  const body = await readBody(req);

  const rawCode =
    body?.pairing_code ||
    body?.pairingCode ||
    body?.code ||
    "";

  const normalizedCode = normalizePairingCode(rawCode);

  if (normalizedCode.length < 8) {
    return json(res, 400, {
      ok: false,
      error: "pairing_code_required",
    });
  }

  const runtimeExpiresHours = normalizePositiveInt(
    body?.runtime_expires_hours || body?.runtimeExpiresHours,
    DEFAULT_RUNTIME_EXPIRES_HOURS,
    MAX_RUNTIME_EXPIRES_HOURS
  );

  const sbUser = supabaseAnonWithToken(accessToken);
  const { data: userData, error: userError } = await sbUser.auth.getUser(accessToken);

  const trackerUser = userData?.user || null;
  const trackerUserId = trackerUser?.id || null;
  const trackerEmail = String(trackerUser?.email || "").trim() || null;

  if (userError || !trackerUserId) {
    return json(res, 401, {
      ok: false,
      error: "invalid_auth",
    });
  }

  const codeHash = sha256Hex(normalizedCode);
  const sbService = supabaseService();

  const { data, error } = await sbService.rpc("rpc_claim_tracker_pairing_code", {
    p_code_hash: codeHash,
    p_tracker_user_id: trackerUserId,
    p_tracker_email: trackerEmail,
    p_runtime_expires_hours: runtimeExpiresHours,
  });

  if (error) {
    console.error("[tracker-pairing-code-claim] rpc error", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    return json(res, 500, {
      ok: false,
      error: "rpc_error",
    });
  }

  const result = data && typeof data === "object" ? data : {};

  if (!result.ok) {
    return json(res, 400, {
      ok: false,
      error: result.error || "pairing_code_claim_failed",
      details: result.details || null,
      existing_personal_id: result.existing_personal_id || null,
    });
  }

  const runtimeToken =
    result.tracker_runtime_token ||
    result.tracker_access_token ||
    null;

  if (!runtimeToken) {
    return json(res, 500, {
      ok: false,
      error: "runtime_token_missing",
    });
  }

  return json(res, 200, {
    ok: true,
    org_id: result.org_id || null,
    personal_id: result.personal_id || null,
    tracker_user_id: result.tracker_user_id || trackerUserId,
    tracker_runtime_token: runtimeToken,
    tracker_access_token: runtimeToken,
    runtime_expires_at: result.runtime_expires_at || null,
  });
}