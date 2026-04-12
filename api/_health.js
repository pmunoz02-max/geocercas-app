export default function handler(req, res) {
	return res.status(200).json({
		ok: true,
		route: '_health',
		debug: 'API_HEALTH_V1',
	})
}
