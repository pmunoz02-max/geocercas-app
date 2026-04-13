export const config = {
  runtime: 'nodejs',
}

import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({
        code: 405,
        message: 'Method not allowed',
      })
    }

    const authHeader =
      req.headers?.authorization ||
      req.headers?.Authorization ||
      ''

    const inviteToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : ''

    if (!inviteToken) {
      return res.status(401).json({
        code: 401,
        message: 'Missing authorization header',
      })
    }


    const inviteTokenHash = sha256Hex(inviteToken)


    // --- DB lookup and runtime session creation (placeholder for real logic) ---
    // Replace the following with actual DB/session logic as needed
    // Example placeholder values:
    const plainRuntimeToken = inviteToken; // In real logic, generate a new token
    const trackerUserId = invite?.tracker_user_id || 'tracker_user_id_placeholder';
    const orgId = invite?.org_id || 'org_id_placeholder';

    // ...existing code for DB lookup and invite validation...

    // --- DB lookup below (disabled for debug) ---
    /*
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { data: invite, error: inviteError } = await supabase
      .from('tracker_invites')
      .select('*')
      .eq('invite_token_hash', inviteTokenHash)
      .maybeSingle()
    */

    if (inviteError) {
      return res.status(500).json({
        code: 500,
        message: inviteError.message,
      })
    }

    if (!invite) {
      return res.status(404).json({
        code: 404,
        message: 'Invite not found',
      })
    }

    if (!invite.is_active) {
      return res.status(409).json({
        code: 409,
        message: 'Invite inactive',
      })
    }

    if (invite.used_at) {
      return res.status(409).json({
        code: 409,
        message: 'Invite already used',
      })
    }

    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      return res.status(410).json({
        code: 410,
        message: 'Invite expired',
      })
    }


    const { error: updateError } = await supabase
      .from('tracker_invites')
      .update({
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invite.id)

    if (updateError) {
      return res.status(500).json({
        code: 500,
        message: updateError.message,
      })
    }

    return res.status(200).json({
      ok: true,
      tracker_runtime_token: plainRuntimeToken,
      tracker_user_id: trackerUserId,
      org_id: orgId,
      redirectTo: '/tracker-gps',
    })
  } catch (error) {
    return res.status(500).json({
      code: 500,
      message: String(error?.message || error),
    })
  }
}