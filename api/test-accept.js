Create a minimal API endpoint that returns a unique debug marker and all headers received.
Código
export default function handler(req, res) {
  return res.status(200).json({
    ok: true,
    debug: 'TEST_ACCEPT_V1',
    headers: req.headers,
  })
}