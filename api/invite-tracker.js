// api/invite-tracker.js
// App Geocercas (PREVIEW) — Invite Tracker Proxy
// BUILD: invite-proxy-v18_ASSIGNMENT_DETAILS_20260311


import crypto from "crypto";
import fetch from "node-fetch";

// Helper: resolve user_id by email using Supabase admin API
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
    const users = Array.isArray(data?.users) ? data.users : data;
    const match = users.find((u) => String(u?.email || "").toLowerCase() === emailLc);
    if (match?.id) return match.id;
    if (!users.length || users.length < perPage) break;
  }
  return null;
}

const BUILD_TAG = "invite-proxy-v18_ASSIGNMENT_DETAILS_20260311";

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
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");

    if (req.method === "OPTIONS") return res.status(200).send("ok");

    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return res.status(503).json({
        build_tag: BUILD_TAG,
        ok: false,
        authenticated: false,
        error: "Missing SUPABASE_URL / SUPABASE_ANON_KEY in server environment",
      });
    }

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
    const invite_id = toStr(body.invite_id).trim();
    const email = toStr(body.email).trim().toLowerCase();
    const lang = toStr(body.lang || "es").trim();
    const name = toStr(body.name).trim();
    const role = toStr(body.role || "tracker").trim().toLowerCase();
    const assignment_id = toStr(body.assignment_id).trim();
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      anonKey;

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

    if (assignment_id && !isUuid(assignment_id)) {
      return res.status(400).json({ ok: false, build: BUILD_TAG, error: "Invalid assignment_id" });
    }

    let asignacion = null;
    let personal_id = null;
    if (assignment_id) {
      try {
        const supabaseUrl = process.env.SUPABASE_URL;
        // status o estado = activa
        const url = `${supabaseUrl}/rest/v1/asignaciones?id=eq.${encodeURIComponent(assignment_id)}&org_id=eq.${encodeURIComponent(org_id)}&is_deleted=eq.false&or=(status.eq.activa,estado.eq.activa)&start_time=lte.${encodeURIComponent(nowIso)}&end_time=gte.${encodeURIComponent(nowIso)}&select=id,org_id,personal_id,status,estado,start_time,end_time`;
        const resp = await fetch(url, {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
        });
        if (resp.ok) {
          const rows = await resp.json();
          asignacion = rows && rows[0];
          if (asignacion && asignacion.personal_id) {
            personal_id = asignacion.personal_id;
          } else {
            console.warn(`[invite-tracker] asignación inválida o sin personal_id`);
          }
        } else {
          console.warn(`[invite-tracker] no se pudo consultar asignaciones`);
        }
      } catch (e) {
        console.warn(`[invite-tracker] error consultando asignaciones`, e);
      }
    }
    // If no assignment_id or no personal_id from assignment, try to get personal by email
    if (!personal_id) {
      try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const url = `${supabaseUrl}/rest/v1/personal?org_id=eq.${encodeURIComponent(org_id)}&email=eq.${encodeURIComponent(email)}&is_deleted=eq.false&select=id,email`;
        const resp = await fetch(url, {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
        });
        if (resp.ok) {
          const rows = await resp.json();
          const personal = rows && rows[0];
          if (personal && personal.id) {
            personal_id = personal.id;
          } else {
            console.warn(`[invite-tracker] no se encontró personal para el email`);
          }
        } else {
          console.warn(`[invite-tracker] error consultando personal`);
        }
      } catch (e) {
        console.warn(`[invite-tracker] error consultando personal`, e);
      }
    }

    // Consultar personal y validar email
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      // Use resolvedPersonalId fallback for null safety
      const resolvedPersonalId = personal_id || (asignacion && asignacion.personal_id) || null;
      const url = `${supabaseUrl}/rest/v1/personal?id=eq.${encodeURIComponent(resolvedPersonalId)}&org_id=eq.${encodeURIComponent(org_id)}&select=id,email`;
      const resp = await fetch(url, {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      });
      if (!resp.ok) throw new Error(`[invite-tracker] no se pudo consultar personal`);
      const rows = await resp.json();
      const personal = rows && rows[0];
      if (!personal || !personal.email || toStr(personal.email).trim().toLowerCase() !== email) {
        console.warn(`[invite-tracker] blocked: email de personal no coincide con invitado`);
        return res.status(422).json({
          ok: false,
          build: BUILD_TAG,
          code: "TRACKER_ASSIGNMENT_EMAIL_MISMATCH",
          message: "La asignación no corresponde al email seleccionado"
        });
      }
    } catch (e) {
      console.warn(`[invite-tracker] blocked: error consultando personal`, e);
      return res.status(500).json({
        ok: false,
        build: BUILD_TAG,
        error: String(e?.message || e),
      });
    }

    // Log validación exitosa antes del fetch al edge
    console.log("[invite-tracker] validated assignment/email", {
      org_id,
      email,
      assignment_id,
      personal_id,
    });

    const ts = String(Date.now());
    const sig = hmacHex(proxySecret, `${ts}\n${org_id}\n${email}`);

    const edgeUrl =
      `${String(supabaseUrl).replace(/\/$/, "")}` +
      `/functions/v1/send-tracker-invite-brevo`;

    // Always include personal_id in tracker creation payload, even if no assignment_id
    const started = Date.now();
    const upstream = await fetch(edgeUrl, {
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
        personal_id, // always present if resolved
      }),
    });

    const ms = Date.now() - started;
    const text = await upstream.text();

    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }

    // After creating tracker, always resolve tracker_user_id (from invite or existing user)
    if (personal_id && json && json.ok !== false) {
      let trackerUserId = json.user_id || json.tracker_user_id || null;
      if (!trackerUserId) {
        // Fallback: resolve by email using admin listUsers
        trackerUserId = await resolveUserIdByEmail({ email, serviceKey, supabaseUrl });
        if (!trackerUserId) {
          console.warn("[invite-tracker] No tracker_user_id returned from invite or found by email, aborting personal patch", { personal_id, org_id, invite_response: json });
          return res.status(500).json({
            ok: false,
            build: BUILD_TAG,
            error: "tracker_user_id_missing",
            message: "No tracker_user_id returned from invite or found by email. Cannot link personal record.",
            personal_id,
            org_id
          });
        }
      }
      try {
        // Fetch current personal record to check user_id
        const getUrl = `${supabaseUrl}/rest/v1/personal?id=eq.${encodeURIComponent(personal_id)}&org_id=eq.${encodeURIComponent(org_id)}&select=id,user_id`;
        const getResp = await fetch(getUrl, {
          headers: { apikey: String(anonKey), Authorization: `Bearer ${anonKey}` },
        });
        if (!getResp.ok) throw new Error("Failed to fetch personal for user_id check");
        const rows = await getResp.json();
        const personal = rows && rows[0];
        if (!personal) throw new Error("Personal record not found after invite");
        if (personal.user_id && personal.user_id !== trackerUserId) {
          // Conflict: user_id already set to a different value
          console.warn(`[invite-tracker] conflict: personal.user_id already set to a different value`, { personal_id, org_id, existing: personal.user_id, new: trackerUserId });
          return res.status(409).json({
            ok: false,
            build: BUILD_TAG,
            error: "personal_user_id_conflict",
            message: "El personal ya está vinculado a otro usuario.",
            personal_id,
            org_id,
            existing_user_id: personal.user_id,
            new_user_id: trackerUserId
          });
        }
        if (!personal.user_id) {
          // Patch personal record if user_id is not set
          const patchUrl = `${supabaseUrl}/rest/v1/personal?id=eq.${encodeURIComponent(personal_id)}&org_id=eq.${encodeURIComponent(org_id)}&user_id=is.null`;
          const patchResp = await fetch(patchUrl, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", apikey: String(anonKey), Authorization: `Bearer ${anonKey}` },
            body: JSON.stringify({ user_id: trackerUserId }),
          });
          if (!patchResp.ok) {
            console.warn("[invite-tracker] failed to patch personal.user_id", await patchResp.text());
            throw new Error("Failed to update personal.user_id after invite");
          }
        }
      } catch (e) {
        console.warn("[invite-tracker] failed to ensure personal.user_id linkage", e);
        return res.status(500).json({
          ok: false,
          build: BUILD_TAG,
          error: "patch_personal_user_id_failed",
          message: String(e?.message || e),
          personal_id,
          org_id
        });
      }
    }

    // After creating tracker, insert tracker_assignments record if assignment_id exists
    // If no assignment_id, allow tracker to run without assignment and enable future linking
    if (assignment_id && personal_id && json && json.ok !== false) {
      try {
        // Fetch assignment details to get geofence_id, start_date, end_date
        const assignmentUrl = `${supabaseUrl}/rest/v1/asignaciones?id=eq.${encodeURIComponent(assignment_id)}&org_id=eq.${encodeURIComponent(org_id)}&select=geofence_id,start_time,end_time`;
        const assignmentResp = await fetch(assignmentUrl, {
          headers: { apikey: String(anonKey), Authorization: `Bearer ${anonKey}` },
        });
        if (assignmentResp.ok) {
          const rows = await assignmentResp.json();
          const assignment = rows && rows[0];
          if (assignment && assignment.geofence_id) {
            const trackerAssignmentsUrl = `${supabaseUrl}/rest/v1/tracker_assignments`;
            const insertBody = [{
              org_id,
              tracker_user_id: personal_id,
              geofence_id: assignment.geofence_id,
              start_date: assignment.start_time ? assignment.start_time.slice(0, 10) : null,
              end_date: assignment.end_time ? assignment.end_time.slice(0, 10) : null,
              active: true,
            }];
            await fetch(trackerAssignmentsUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: String(anonKey), Authorization: `Bearer ${anonKey}` },
              body: JSON.stringify(insertBody),
            });
          }
        }
      } catch (e) {
        console.warn("[invite-tracker] failed to insert tracker_assignments", e);
      }
    }
    // If no assignment_id, do nothing: tracker is created and can be linked to assignments later

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
        assignment_id: assignment_id || null,
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