export const config = {
  runtime: 'nodejs',
}

export default function handler(req, res) {
  return res.status(200).json({
    ok: true,
    route: 'accept-tracker-invite',
    debug: 'ACCEPT_INVITE_NODE_FIXED_V3',
    method: req.method || null,
    url: req.url || null,
    ts: new Date().toISOString(),
  })
}