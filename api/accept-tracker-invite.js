export const config = {
  runtime: 'nodejs',
}

export default async function handler(req, res) {
  const authHeader =
    req.headers?.authorization ||
    req.headers?.Authorization ||
    null

  return res.status(200).json({
    ok: true,
    debug: 'ACCEPT_HEADER_DEBUG_V1',
    method: req.method || null,
    hasAuthorization: !!authHeader,
    authPrefix: authHeader ? String(authHeader).slice(0, 20) : null,
    headerKeys: Object.keys(req.headers || {}),
  })
}