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
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");

    if (req.method === "OPTIONS") return res.status(200).send("ok");

    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
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
      return res.status(405).json({
        ok: false,
        build: BUILD_TAG,
        error: "Method not allowed",
      });
    }

    if (!supabaseUrl || !anonKey || !proxySecret) {
      return res.status(500).json({
        ok: false,
        build: BUILD_TAG,
        error: "Server missing env",
        diag: {
          hasUrl: !!supabaseUrl,
          hasAnon: !!anonKey,
          hasProxySecret: !!proxySecret,
        },
      });
    }

    const body = req.body || {};
    const org_id = toStr(body.org_id).trim();
    const invite_id = toStr(body.invite_id).trim();
    const email = toStr(body.email).trim().toLowerCase();
    const lang = toStr(body.lang || "es").trim();
    const name = toStr(body.name).trim();
    const role = toStr(body.role || "tracker").trim().toLowerCase();
    const assignment_id = toStr(body.assignment_id).trim();
    const caller_jwt = toStr(body.caller_jwt).trim();

    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      anonKey;

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    if (!caller_jwt) {
      return res.status(401).json({
        ok: false,
        build: BUILD_TAG,
        error: "Missing caller_jwt",
      });
    }

    if (!isUuid(org_id)) {
      return res.status(400).json({
        ok: false,
        build: BUILD_TAG,
        error: "Invalid org_id",
      });
    }

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        ok: false,
        build: BUILD_TAG,
        error: "Invalid email",
      });
    }

    if (!assignment_id) {
      return res.status(400).json({
        ok: false,
        build: BUILD_TAG,
        error: "assignment_required",
        message: "Assignment is required for tracker invite",
      });
    }

    if (!isUuid(assignment_id)) {
      return res.status(400).json({
        ok: false,
        build: BUILD_TAG,
        error: "Invalid assignment_id",
      });
    }

    let asignacion = null;
    let personal_id = null;
    let trackerUserId = null;

    const nowIso = new Date().toISOString();

    try {
      const { data: rows, error: asignErr } = await supabaseAdmin
        .from("asignaciones")
        .select("id,org_id,personal_id,status,estado,start_time,end_time")
        .eq("id", assignment_id)
        .eq("org_id", org_id)
        .eq("is_deleted", false)
        .or("status.eq.activa,estado.eq.activa")
        .lte("start_time", nowIso)
        .gte("end_time", nowIso)
        .limit(1);

      if (asignErr) {
        console.warn("[invite-tracker] no se pudo consultar asignaciones", asignErr);
      } else {
        asignacion = rows?.[0] || null;
        personal_id = asignacion?.personal_id || null;
      }
    } catch (e) {
      console.warn("[invite-tracker] error consultando asignaciones", e);
    }

    if (!personal_id) {
      try {
        const { data: rows, error: personalErr } = await supabaseAdmin
          .from("personal")
          .select("id,email")
          .eq("org_id", org_id)
          .eq("email", email)
          .eq("is_deleted", false)
          .limit(1);

        if (personalErr) {
          console.warn("[invite-tracker] no se pudo consultar personal por email", personalErr);
        } else {
          personal_id = rows?.[0]?.id || null;
        }
      } catch (e) {
        console.warn("[invite-tracker] error consultando personal", e);
      }
    }

    if (!personal_id) {
      return res.status(400).json({
        ok: false,
        build: BUILD_TAG,
        code: "personal_not_found_for_invite",
        message: "No existe registro de personal para invitar en la organización",
        org_id,
        email,
        assignment_id,
      });
    }

    const { data: validateRows, error: validateErr } = await supabaseAdmin
      .from("personal")
      .select("id,email,user_id,org_id")
      .eq("id", personal_id)
      .eq("org_id", org_id)
      .limit(1);

    if (validateErr) {
      return res.status(500).json({
        ok: false,
        build: BUILD_TAG,
        error: "personal_validation_failed",
        message: String(validateErr.message || validateErr),
      });
    }

    const personalRow = Array.isArray(validateRows) ? validateRows[0] : null;

    if (!personalRow) {
      return res.status(400).json({
        ok: false,
        build: BUILD_TAG,
        error: "personal_not_found_for_invite",
        message: "Personal record does not exist in this organization",
        personal_id,
        org_id,
        email,
      });
    }

    personal_id = personalRow.id;

    if (personalRow.user_id) {
      trackerUserId = personalRow.user_id;
    } else {
      trackerUserId = await resolveUserIdByEmail({
        email,
        serviceKey,
        supabaseUrl,
      });
    }

    console.log("[invite-tracker] validated assignment/email", {
      org_id,
      email,
      assignment_id,
      personal_id,
      tracker_user_id_preinvite: trackerUserId,
    });

    const ts = String(Date.now());
    const sig = hmacHex(proxySecret, `${ts}\n${org_id}\n${email}`);
    const edgeUrl = `${String(supabaseUrl).replace(/\/$/, "")}/functions/v1/send-tracker-invite-brevo`;

    console.log("[invite-tracker] start", {
      org_id,
      tracker_identifier: trackerUserId || email || null,
      email,
      assignment_id,
      personal_id,
      edge_url: edgeUrl,
    });


    // --- New upstream fetch and error handling ---
    const upstreamRes = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: String(anonKey),
        Authorization: `Bearer ${anonKey}`,
        "x-user-jwt": caller_jwt,
        "x-edge-ts": ts,
        "x-edge-sig": sig,
        "x-app-lang": lang,
      },
      body: JSON.stringify({
        org_id,
        invite_id,
        email,
        lang,
        name,
        role,
        assignment_id,
        personal_id,
      }),
    });

    const ms = Date.now() - started;
    const upstreamText = await upstreamRes.text();
    let upstreamJson = null;
    try {
      upstreamJson = upstreamText ? JSON.parse(upstreamText) : null;
    } catch (_) {
      upstreamJson = null;
    }

    const upstreamInviteUrl = pickInviteUrlFromUpstream(upstreamJson);
    const realInviteId = pickInviteIdFromUpstream(upstreamJson);
    const realCreatedAt = pickCreatedAtFromUpstream(upstreamJson);

    console.log("[invite-tracker] upstream response", {
      status: upstreamRes.status,
      ok: upstreamRes.ok,
      ms,
      invite_id: realInviteId || null,
      created_at: realCreatedAt || null,
      invite_url: upstreamInviteUrl || null,
      raw_keys: upstreamJson && typeof upstreamJson === "object" ? Object.keys(upstreamJson) : [],
    });

    if (!upstreamRes.ok) {
      console.error("[api/invite-tracker] upstream failed", {
        status: upstreamRes.status,
        body: upstreamText,
      });
      return res.status(upstreamRes.status).json({
        ok: false,
        error: upstreamJson?.error || "invite_upstream_failed",
        upstream_status: upstreamRes.status,
        upstream_body: upstreamJson || upstreamText || null,
      });
    }

    if (!upstreamInviteUrl) {
      return res.status(502).json({
        ok: false,
        build: BUILD_TAG,
        error: "missing_invite_url_from_upstream",
        message: "Upstream invite flow did not return invite_url/inviteUrl/action_link/redirect_to",
        upstream_status: upstreamRes.status,
        upstream_body: upstreamJson || upstreamText || null,
      });
    }

    if (hasForbiddenMagicMarkers(upstreamInviteUrl)) {
      return res.status(502).json({
        ok: false,
        build: BUILD_TAG,
        error: "forbidden_magiclink_pattern_in_upstream_invite_url",
        message: "Tracker invite URL must not contain auth/callback, token_hash, or magiclink markers",
        invite_url_preview: upstreamInviteUrl.slice(0, 220),
      });
    }

    const parsedInviteUrl = parseTrackerInviteUrl(upstreamInviteUrl);
    if (!parsedInviteUrl.valid) {
      return res.status(400).json({
        ok: false,
        build: BUILD_TAG,
        error: "invalid_tracker_invite_url_shape",
        message:
          parsedInviteUrl.reason === "Faltan parámetros esenciales"
            ? "La URL de invitación no contiene los parámetros esenciales (org_id y access_token)."
            : `URL de invitación inválida: ${parsedInviteUrl.reason}`,
        details: parsedInviteUrl,
        invite_url_preview: upstreamInviteUrl.slice(0, 220),
      });
    }

    if (!realInviteId || !realCreatedAt) {
      return res.status(500).json({
        ok: false,
        build: BUILD_TAG,
        error: "invite_row_was_not_created",
        message:
          "invite-tracker must not return invite_url unless upstream returns invite_id and created_at from a real tracker_invites row",
        upstream_body: upstreamJson || upstreamText || null,
      });
    }

    // Use upstreamJson as the response body for success
    const data = upstreamJson || {};
    return res.status(200).json(data);
        personal_id,
        org_id,
      });
    }

    try {
      const normalizedEmail = String(email || "").trim().toLowerCase();

      const { data: candidateRows, error: candidateErr } = await supabaseAdmin
        .from("personal")
        .select("id,email,user_id,org_id")
        .eq("id", personal_id)
        .limit(1);

      if (candidateErr) {
        throw new Error(`Failed candidate personal lookup: ${candidateErr.message || candidateErr}`);
      }

      let personal = Array.isArray(candidateRows) ? candidateRows[0] : null;

      if (!personal || String(personal.org_id) !== String(org_id)) {
        const { data: rows, error: getErr } = await supabaseAdmin
          .from("personal")
          .select("id,email,user_id,org_id")
          .eq("org_id", org_id)
          .eq("email", normalizedEmail);

        if (getErr) {
          throw new Error(`Failed to fetch personal for user_id check: ${getErr.message || getErr}`);
        }

        personal = Array.isArray(rows)
          ? rows.find((r) => String(r.email || "").trim().toLowerCase() === normalizedEmail) || null
          : null;
      }

      if (!personal) {
        return res.status(500).json({
          ok: false,
          build: BUILD_TAG,
          error: "personal_not_found_after_invite",
          email: normalizedEmail,
          org_id,
          personal_id,
        });
      }

      if (!personal.user_id) {
        const { error: linkErr } = await supabaseAdmin
          .from("personal")
          .update({ user_id: trackerUserId })
          .eq("id", personal.id)
          .eq("org_id", org_id);

        if (linkErr) {
          console.warn("[invite-tracker] failed to link personal.user_id", linkErr);
        } else {
          personal.user_id = trackerUserId;
        }
      } else if (String(personal.user_id) !== String(trackerUserId)) {
        return res.status(409).json({
          ok: false,
          build: BUILD_TAG,
          error: "personal_user_id_conflict",
          message: "El personal ya está vinculado a otro usuario.",
          personal_id: personal.id,
          org_id,
          existing_user_id: personal.user_id,
          invited_user_id: trackerUserId,
        });
      }

      if (assignment_id) {
        try {
          const { data: assignment, error: assignmentErr } = await supabaseAdmin
            .from("asignaciones")
            .select("geofence_id,start_time,end_time")
            .eq("id", assignment_id)
            .eq("org_id", org_id)
            .limit(1)
            .maybeSingle();

          if (!assignmentErr && assignment?.geofence_id) {
            const insertBody = [
              {
                org_id,
                tracker_user_id: trackerUserId,
                geofence_id: assignment.geofence_id,
                start_date: assignment.start_time ? assignment.start_time.slice(0, 10) : null,
                end_date: assignment.end_time ? assignment.end_time.slice(0, 10) : null,
                active: true,
              },
            ];

            const { error: insertErr } = await supabaseAdmin
              .from("tracker_assignments")
              .insert(insertBody);

            if (insertErr) {
              console.warn("[invite-tracker] failed inserting tracker_assignments", insertErr);
            }
          } else if (assignmentErr) {
            console.warn("[invite-tracker] failed reading assignment details", assignmentErr);
          }
        } catch (e) {
          console.warn("[invite-tracker] failed to insert tracker_assignments", e);
        }
      }

      console.log("[invite-tracker] return", {
        invite_id: realInviteId,
        created_at: realCreatedAt,
        invite_url: upstreamInviteUrl,
        linked_user_id: personal.user_id || trackerUserId,
      });

      return res.status(200).json({
        ok: true,
        build: BUILD_TAG,
        invited: true,
        invite_sent: json?.invite_sent ?? true,
        invite_reused: json?.invite_reused ?? false,
        cooldown_active: json?.cooldown_active ?? false,
        invite_id: realInviteId,
        created_at: realCreatedAt,
        invite_url: upstreamInviteUrl,
        action_link: upstreamInviteUrl,
        redirect_to: upstreamInviteUrl,
        personal_id: personal.id,
        org_id,
        email: normalizedEmail,
        linked_user_id: personal.user_id || trackerUserId,
        upstream: json || null,
      });
    } catch (e) {
      console.warn("[invite-tracker] failed to finalize invite flow", e);
      return res.status(500).json({
        ok: false,
        build: BUILD_TAG,
        error: "invite_finalize_failed",
        message: String(e?.message || e),
        personal_id,
        org_id,
      });
    }
  } catch (e) {
    return res.status(500).json({
      ok: false,
      build: BUILD_TAG,
      error: String(e?.message || e),
    });
  }
}