export const config = {
  runtime: 'nodejs',
}

export default function handler(req, res) {
  return res.status(200).json({
    ok: true,
    debug: 'ROUTE_OVERRIDE_CONFIRM_V2',
    method: req.method || null,
    ts: new Date().toISOString(),
  })
}