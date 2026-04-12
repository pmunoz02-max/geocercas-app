import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

// Admin Supabase client (service role)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

function getBearerToken(req) {
  const auth = req.headers.authorization || ''
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({
      code: 'SERVER_MISCONFIGURED',
      message: 'Missing Supabase server credentials',
    })
  }

  const sbAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const inviteToken = getBearerToken(req)
  const orgId = req.body?.org_id || null

  if (!inviteToken) {
    return res.status(401).json({
      code: 'MISSING_INVITE_TOKEN',
      message: 'Missing invite token',
    })
  }

  const inviteTokenHash = sha256Hex(inviteToken)

  const { data: invite, error: inviteError } = await sbAdmin
    .from('tracker_invites')
    .select('id, org_id, email, email_norm, is_active, expires_at, used_at, accepted_at')
    .eq('invite_token_hash', inviteTokenHash)
    .eq('is_active', true)
    .is('used_at', null)
    .is('accepted_at', null)
    .single()

  if (inviteError || !invite) {
    return res.status(404).json({
      code: 'INVITE_NOT_FOUND',
      message: 'Tracker invite not found or already used',
      details: inviteError?.message || null,
    })
  }

  if (orgId && invite.org_id !== orgId) {
    return res.status(400).json({
      code: 'ORG_MISMATCH',
      message: 'Invite org does not match request org',
    })
  }

  if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
    return res.status(410).json({
      code: 'INVITE_EXPIRED',
      message: 'Tracker invite has expired',
    })
  }

  const { data: claim, error: claimError } = await sbAdmin.rpc('get_tracker_invite_claim', {
    p_invite_id: invite.id,
  })

  if (claimError) {
    return res.status(400).json({
      code: 'CLAIM_LOOKUP_FAILED',
      message: claimError.message || 'Could not resolve tracker invite claim',
      details: claimError,
    })
  }

  if (!claim?.ok) {
    return res.status(400).json({
      code: claim?.error || 'CLAIM_INVALID',
      message: 'Tracker invite claim could not be resolved',
      claim,
    })
  }

  const trackerUserId = claim?.tracker_user_id || null

  const updatePayload = {
    accepted_at: new Date().toISOString(),
    used_at: new Date().toISOString(),
    is_active: false,
  }

  if (trackerUserId) {
    updatePayload.used_by_user_id = trackerUserId
  }

  const { error: updateError } = await sbAdmin
    .from('tracker_invites')
    .update(updatePayload)
    .eq('id', invite.id)
    .is('used_at', null)
    .is('accepted_at', null)

  if (updateError) {
    return res.status(400).json({
      code: 'INVITE_UPDATE_FAILED',
      message: updateError.message || 'Could not mark tracker invite as accepted',
      details: updateError,
    })
  }

  return res.status(200).json({
    ok: true,
    invite_id: invite.id,
    org_id: invite.org_id,
    tracker_user_id: trackerUserId,
    email: invite.email || invite.email_norm || null,
  })
}
    const fn = "accept-tracker-invite";
    const signature = hmacHex(TRACKER_PROXY_SECRET, `${fn}.${ts}.${rawBody}`);

    const candidateBases = [
      ...(explicitFunctionsBase ? [explicitFunctionsBase] : []),
      ...deriveFunctionsBasesFromSupabaseUrl(SUPABASE_URL),
    ];

    const uniqueBases = [...new Set(candidateBases.filter(Boolean))];
    const candidates = uniqueBases.map((b) => `${b}/${fn}`);

    const headers = {
      "Content-Type": "application/json",
      "X-Proxy-Ts": ts,
      "X-Proxy-Signature": signature,
    };

    const attempts = [];
    for (const url of candidates) {
      try {
        const result = await tryPostJson(url, rawBody, headers);
        attempts.push(result);

        if (result.ok) {
          return json(res, 200, {
            ok: true,
            build_tag: BUILD_TAG,
            proxy_user_id: user_id,
            proxy_org_id: org_id,
            edge_url_used: result.url,
            edge_response: result.data,
            attempts,
          });
        }

        // --- [plan-enforcement][tracker-create] Interceptar error comercial TRACKER_LIMIT_REACHED ---
        if (!result.ok && result.data) {
          // 1) Si viene en result.data.detail como string JSON serializado
          if (typeof result.data.detail === 'string') {
            try {
              const parsed = JSON.parse(result.data.detail);
              if (parsed && parsed.code === 'TRACKER_LIMIT_REACHED') {
                return json(res, 403, {
                  ok: false,
                  code: 'TRACKER_LIMIT_REACHED',
                  message: 'Límite de trackers alcanzado para el plan actual.',
                  upgrade_required: true,
                  detail: parsed,
                });
              }
            } catch {}
          }
          // 2) Si viene en result.data.code directamente
          if (result.data.code === 'TRACKER_LIMIT_REACHED') {
            return json(res, 403, {
              ok: false,
              code: 'TRACKER_LIMIT_REACHED',
              message: 'Límite de trackers alcanzado para el plan actual.',
              upgrade_required: true,
              detail: result.data,
            });
          }
        }
      } catch (e) {
        attempts.push({
          ok: false,
          status: 0,
          url,
          data: { error: e?.message || String(e) },
        });
      }
    }

    const last = attempts[attempts.length - 1] || null;

    return json(res, last?.status || 502, {
      ok: false,
      build_tag: BUILD_TAG,
      error: "EDGE_CALL_FAILED",
      explicit_functions_raw: explicitFunctionsRaw || null,
      explicit_functions_base: explicitFunctionsBase || null,
      supabase_url_used: SUPABASE_URL,
      edge_url_candidates: candidates,
      attempts,
    });
  } catch (e) {
    return json(res, 500, {
      ok: false,
      build_tag: BUILD_TAG,
      error: e?.message || String(e),
    });
  }
}