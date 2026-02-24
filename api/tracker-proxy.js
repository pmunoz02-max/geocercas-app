import type { VercelRequest, VercelResponse } from '@vercel/node'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROXY_SECRET = process.env.TRACKER_PROXY_SECRET

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const build_tag = 'tracker-proxy-v7_prod_jwt_forward_20260224'
  const fn = req.query.fn as string

  if (!SUPABASE_URL || !SERVICE_ROLE || !PROXY_SECRET) {
    return res.status(500).json({
      ok: false,
      build_tag,
      error: 'Missing env'
    })
  }

  if (!fn) {
    return res.status(400).json({
      ok: false,
      build_tag,
      error: 'Missing fn'
    })
  }

  try {
    // 🔐 Forward JWT correctly
    const incomingAuth = req.headers.authorization

    const authHeader =
      incomingAuth && incomingAuth.startsWith('Bearer ')
        ? incomingAuth
        : `Bearer ${SERVICE_ROLE}`

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/${fn}`,
      {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          'x-proxy-secret': PROXY_SECRET
        },
        body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
      }
    )

    const data = await response.json()

    return res.status(response.status).json({
      build_tag,
      fn,
      upstream_status: response.status,
      ...data
    })
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      build_tag,
      error: err.message
    })
  }
}