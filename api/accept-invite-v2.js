export default function handler(req, res) {
  return res.status(200).json({
    ok: true,
    debug: 'NEW_ENDPOINT_V2_WORKING',
  })
}