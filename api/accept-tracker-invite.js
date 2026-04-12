export const config = {
  runtime: 'nodejs',
}

import crypto from 'crypto'

export default async function handler(req, res) {
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

  // Hash inviteToken with SHA-256 (hex)
  const inviteTokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex')

  // ...next: validate inviteTokenHash against tracker_invites.invite_token_hash
  return res.status(200).json({
    ok: true,
    debug: 'INVITE_TOKEN_HASHED',
    inviteTokenPrefix: inviteToken.slice(0, 12),
    inviteTokenHash,
  })
}