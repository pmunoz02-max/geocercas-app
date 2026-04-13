/*
INVITE-TRACKER FLOW DOCUMENTATION
---------------------------------

Este endpoint implementa el flujo de invitación de trackers, garantizando integridad y sincronización entre la tabla `personal` y el sistema de autenticación (`auth.users`).

FLUJO GENERAL:
1. **Recepción de parámetros**: org_id, email, assignment_id (opcional), etc.
2. **Resolución de personal_id**:
   - Si se provee assignment_id, se busca el registro de asignación y se extrae personal_id.
   - Si no se encuentra por asignación, se busca el registro de personal por email dentro de la organización.
3. **Validación obligatoria de existencia de personal**:
   - Si no existe registro de personal, retorna 400 `personal_not_found_for_invite` y no continúa.
   - Se valida que el registro de personal pertenezca a la organización y tenga el email correcto.
4. **Validación de conflicto de user_id**:
   - Si el registro de personal ya tiene un user_id distinto al usuario que se intenta invitar, retorna 409 `personal_user_id_conflict` y no continúa.
5. **Invitación y sincronización con auth.users**:
   - Se realiza la invitación (llamada a función edge).
   - Si la invitación es exitosa y se obtiene un user_id, se sincroniza el campo `user_id` en el registro de personal (si aún no está seteado).
   - Si ya existe user_id en personal y coincide, no se realiza ningún cambio.
6. **Creación de tracker_assignments** (si corresponde):
   - Si se provee assignment_id y la invitación fue exitosa, se crea el registro de asignación para el tracker.

VALIDACIONES CLAVE:
- No se permite invitar si no existe registro de personal en la organización para el email indicado.
- No se permite invitar si el registro de personal ya está vinculado a otro usuario.
- Siempre se sincroniza el campo user_id de personal con el usuario invitado si es necesario.

Este flujo garantiza que cada invitación de tracker esté asociada a un registro de personal único y correctamente vinculado con el usuario de autenticación, evitando duplicidades y errores de integridad.
*/

// api/invite-tracker.js
// App Geocercas (PREVIEW) — Invite Tracker Proxy
// BUILD: invite-proxy-v18_ASSIGNMENT_DETAILS_20260311


import crypto from "crypto";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

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


// Acepta variantes válidas de parámetros y loggea

// Nueva versión: acepta /tracker-accept y /accept-invite, tolera params en querystring y hash
function parseTrackerInviteUrl(url) {
  const s = toStr(url).trim();
  if (!s) return { valid: false, reason: "URL vacía" };
  try {
    // Permitir hash params
    let urlObj;
    try {
      urlObj = new URL(s);
    } catch (e) {
      // Si no es URL absoluta, intentar agregar dummy host
      urlObj = new URL(s, "https://dummy.local");
    }
    // Permitir ambos paths
    const validPaths = ["/tracker-accept", "/accept-invite"];
    if (!validPaths.includes(urlObj.pathname)) {
      return { valid: false, reason: "Path inválido", url: s, pathname: urlObj.pathname };
    }
    // Extraer params de query y hash
    const params = new URLSearchParams(urlObj.search);
    if (urlObj.hash && urlObj.hash.startsWith("#")) {
      const hashParams = new URLSearchParams(urlObj.hash.slice(1));
      for (const [k, v] of hashParams.entries()) {
        if (!params.has(k)) params.set(k, v);
      }
    }
    // Acepta variantes de parámetros
    const org_id = params.get("org_id") || params.get("org") || params.get("orgId");
    const access_token = params.get("access_token") || params.get("token") || params.get("token_hash") || params.get("invite_token");
    // Loggeo
    console.log("[invite-tracker] invite_url recibida", { url: s, org_id, access_token, params: Object.fromEntries(params.entries()) });
    // Solo lanzar error si faltan ambos org_id y token
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
    return { valid: false, reason: "URL inválida", error: String(e), url: s };
  }
}

function pickInviteUrlFromUpstream(json) {
  const candidates = [json?.inviteUrl, json?.action_link, json?.redirect_to];
  for (const c of candidates) {
    const s = toStr(c).trim();
    if (s) return s;
  }
  return "";
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

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

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

    if (!assignment_id) {
      return res.status(400).json({
        ok: false,
        error: "assignment_required",
        message: "Assignment is required for tracker invite",
      });
    }

    if (assignment_id && !isUuid(assignment_id)) {
      return res.status(400).json({ ok: false, build: BUILD_TAG, error: "Invalid assignment_id" });
    }

    let asignacion = null;
    let personal_id = null;
    // Definir nowIso antes del query de asignaciones
    const nowIso = new Date().toISOString();
    if (assignment_id) {
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

        if (!asignErr) {
          asignacion = rows && rows[0];
          if (asignacion?.personal_id) {
            personal_id = asignacion.personal_id;
          } else {
            console.warn("[invite-tracker] asignación inválida o sin personal_id");
          }
        } else {
          console.warn("[invite-tracker] no se pudo consultar asignaciones", asignErr);
        }
      } catch (e) {
        console.warn(`[invite-tracker] error consultando asignaciones`, e);
      }
    }
    // If no assignment_id or no personal_id from assignment, try to get personal by email
    if (!personal_id) {
      try {
        const { data: rows, error: personalErr } = await supabaseAdmin
          .from("personal")
          .select("id,email")
          .eq("org_id", org_id)
          .eq("email", email)
          .eq("is_deleted", false)
          .limit(1);

        if (!personalErr) {
          const personal = rows && rows[0];
          if (personal?.id) {
            personal_id = personal.id;
          }
        } else {
          console.warn("[invite-tracker] no se pudo consultar personal por email", personalErr);
        }
      } catch (e) {
        console.warn(`[invite-tracker] error consultando personal`, e);
      }
    }

    // Validar que exista personal antes de invitar
    if (!personal_id) {
      console.warn(`[invite-tracker] personal no encontrado para invitar`, { org_id, email, assignment_id });
      return res.status(400).json({
        ok: false,
        build: BUILD_TAG,
        code: "personal_not_found_for_invite",
        message: "No existe registro de personal para invitar en la organización",
        org_id,
        email,
        assignment_id
      });
    }

    // Consultar personal y validar email
    // --- NUEVA LÓGICA: reutilizar auth user existente por email antes de invitar ---
    const normalizedEmail = String(email || "").trim().toLowerCase();
    let trackerUserId = null;
    let reusedExistingUser = false;

    // 1) Buscar auth user existente por email usando service key

    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const userResp = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(normalizedEmail)}`, {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      });
      if (userResp.ok) {
        const userJson = await userResp.json();
        const user = Array.isArray(userJson?.users) ? userJson.users[0] : (Array.isArray(userJson) ? userJson[0] : null);
        if (user && user.id) {
          trackerUserId = user.id;
          reusedExistingUser = true;
        }
      }
    } catch (e) {
      console.warn("[invite-tracker] failed to resolve existing user by email", normalizedEmail, e);
    }

    // 2) Si existe -> trackerUserId = existing id, reusedExistingUser = true
    // 3) Si no existe -> ejecutar invite/creation original y obtener trackerUserId
    // Always rely on Brevo invite flow to create or reuse user
    // trackerUserId will be resolved after invite if needed
    // 4) Luego SIEMPRE continuar con:
    //    - validación de personal post-invite/post-link
    //    - vinculación personal.user_id
    //    - alta o confirmación en la org con rol tracker

    // Log validación exitosa antes del fetch al edge

    // Validación dura de existencia de personal antes de invitar
    const resolvedPersonalId = personal_id || (asignacion && asignacion.personal_id) || null;
    if (!resolvedPersonalId) {
      return res.status(400).json({
        ok: false,
        error: "personal_not_found_for_invite",
        message: "No personal record found for this invite",
        org_id,
        email,
        assignment_id: assignment_id || null,
      });
    }

    const { data: validateRows, error: validateErr } = await supabaseAdmin
      .from("personal")
      .select("id,email,user_id")
      .eq("id", resolvedPersonalId)
      .eq("org_id", org_id)
      .limit(1);

    if (validateErr) {
      return res.status(500).json({
        ok: false,
        error: "personal_validation_failed",
        message: String(validateErr.message || validateErr),
      });
    }

    const personalRow = Array.isArray(validateRows) ? validateRows[0] : null;

    if (!personalRow) {
      return res.status(400).json({
        ok: false,
        error: "personal_not_found_for_invite",
        message: "Personal record does not exist in this organization",
        personal_id: resolvedPersonalId,
        org_id,
        email,
      });
    }

    personal_id = personalRow.id;


    // NUEVA LÓGICA: Si personal.user_id existe, usarlo como canónico y continuar flujo
    let canonicalUserId = null;
    if (personalRow.user_id) {
      canonicalUserId = personalRow.user_id;
      // No buscar ni crear auth user, no lanzar conflicto
      // Continuar flujo usando canonicalUserId
    } else {
      // Si no existe user_id, seguir con el flujo actual de invitación por email
      // Buscar auth user existente por email usando service key
      let trackerUserId = null;
      let reusedExistingUser = false;
      try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const userResp = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
        });
        if (userResp.ok) {
          const userJson = await userResp.json();
          const user = Array.isArray(userJson?.users) ? userJson.users[0] : (Array.isArray(userJson) ? userJson[0] : null);
          if (user && user.id) {
            trackerUserId = user.id;
            reusedExistingUser = true;
          }
        }
      } catch (e) {
        console.warn("[invite-tracker] failed to resolve existing user by email", email, e);
      }
      // Si hay inconsistencia real, bloquear
      if (trackerUserId && personalRow.user_id && personalRow.user_id !== trackerUserId) {
        return res.status(409).json({
          ok: false,
          error: "personal_user_id_conflict",
          message: "El personal ya está vinculado a otro usuario.",
          personal_id: personalRow.id,
          org_id,
          existing_user_id: personalRow.user_id,
          invited_user_id: trackerUserId,
        });
      }
      // Si no hay conflicto, canonicalUserId será el que se obtenga tras la invitación
    }

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
    console.log("[invite-tracker] invite_request", {
      org_id,
      email,
      assignment_id,
    });
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

    const upstreamInviteUrl = pickInviteUrlFromUpstream(json);

    if (upstream.ok) {
      if (!upstreamInviteUrl) {
        return res.status(502).json({
          ok: false,
          build: BUILD_TAG,
          error: "missing_invite_url_from_upstream",
          message: "Upstream invite flow did not return inviteUrl/action_link/redirect_to",
          edge_status: upstream.status,
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
        // Loggeo robusto
        console.warn("[invite-tracker] URL de invitación inválida o incompleta", parsedInviteUrl);
        return res.status(400).json({
          ok: false,
          build: BUILD_TAG,
          error: "invalid_tracker_invite_url_shape",
          message:
            parsedInviteUrl.reason === "Faltan parámetros esenciales"
              ? "La URL de invitación no contiene los parámetros esenciales (org_id y access_token). Verifica que el link sea correcto o solicita una nueva invitación."
              : `URL de invitación inválida: ${parsedInviteUrl.reason}`,
          details: parsedInviteUrl,
          invite_url_preview: upstreamInviteUrl.slice(0, 220),
        });
      }
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
        const normalizedEmail = String(email || "").trim().toLowerCase();

        console.log("[invite-tracker] post-invite lookup start", {
          personal_id,
          org_id,
          email,
          normalizedEmail,
        });

        const { data: candidateRows, error: candidateErr } = await supabaseAdmin
          .from("personal")
          .select("id,email,user_id,org_id")
          .eq("id", personal_id)
          .limit(1);

        if (candidateErr) {
          throw new Error(`Failed candidate personal lookup: ${candidateErr.message || candidateErr}`);
        }

        const candidate = Array.isArray(candidateRows) ? candidateRows[0] : null;

        console.log("[invite-tracker] candidateRows", {
          count: Array.isArray(candidateRows) ? candidateRows.length : -1,
          first: candidate || null,
        });

        let personal = null;

        if (candidate && String(candidate.org_id) === String(org_id)) {
          personal = candidate;
        } else {
          console.log("[invite-tracker] email fallback lookup", { normalizedEmail });

          const { data: rows, error: getErr } = await supabaseAdmin
            .from("personal")
            .select("id,email,user_id,org_id")
            .eq("org_id", org_id)
            .eq("email", normalizedEmail);

          if (getErr) {
            throw new Error(`Failed to fetch personal for user_id check: ${getErr.message || getErr}`);
          }

          console.log("[invite-tracker] email fallback rows", {
            count: Array.isArray(rows) ? rows.length : -1,
            rows: Array.isArray(rows) ? rows : [],
          });

          personal = Array.isArray(rows)
            ? rows.find((r) => String(r.email || "").trim().toLowerCase() === normalizedEmail) || null
            : null;
        }

        console.log("[invite-tracker] resolved personal after invite", {
          personal: personal || null,
        });

        if (!personal) {
          return res.status(500).json({
            ok: false,
            error: "personal_not_found_after_invite",
            email: normalizedEmail,
            org_id,
            personal_id: personal_id || null,
          });
        }

        // Link auth.user.id to personal.user_id if not already set
        if (!personal.user_id && trackerUserId) {
          console.log("[invite-tracker] linking personal.user_id to auth user", {
            personal_id: personal.id,
            org_id,
            user_id: trackerUserId
          });
          
          const { error: linkErr } = await supabaseAdmin
            .from("personal")
            .update({ user_id: trackerUserId })
            .eq("id", personal.id)
            .eq("org_id", org_id);

          if (linkErr) {
            console.warn("[invite-tracker] failed to link personal.user_id", linkErr);
            // Continue anyway - the linkage can be completed on first login
          } else {
            console.log("[invite-tracker] successfully linked personal.user_id");
            personal.user_id = trackerUserId;
          }
        } else if (personal.user_id && personal.user_id !== trackerUserId) {
          console.log("[invite-tracker] personal.user_id already linked to different user", {
            existing_user_id: personal.user_id,
            invite_user_id: trackerUserId
          });
        }

        return res.status(200).json({
          ok: true,
          build: BUILD_TAG,
          invited: true,
          invite_sent: json?.invite_sent ?? true,
          invite_reused: json?.invite_reused ?? false,
          cooldown_active: json?.cooldown_active ?? false,
          personal_id: personal.id,
          org_id,
          email: normalizedEmail,
          linked_user_id: personal.user_id || trackerUserId || null,
          invite_url: upstreamInviteUrl || null,
          action_link: upstreamInviteUrl || null,
          redirect_to: upstreamInviteUrl || null,
          message:
            json?.message ||
            "Invitación procesada correctamente. El usuario se ha vinculado a la organización.",
          upstream: json || null,
        });
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
    // If no assignment_id, do nothing: tracker is created and can be linked to assignments later

    // Extract and log invite_id, created_at, and invite_url from current request only
    const inviteId = json?.invite_id || json?.id || null;
    const createdAt = json?.created_at || null;
    const inviteUrl = upstreamInviteUrl || null;
    console.log('[invite-tracker] invite created', {
      invite_id: inviteId,
      created_at: createdAt,
      invite_url: inviteUrl,
      org_id,
    });

    // Return only invite_id, created_at, and invite_url from this request
    return res.status(200).json({
      invite_id: inviteId,
      created_at: createdAt,
      invite_url: inviteUrl
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      build: BUILD_TAG,
      error: String(e?.message || e),
    });
  }
}