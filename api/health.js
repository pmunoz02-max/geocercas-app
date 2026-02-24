module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ ok: true, where: "api/health.js", ts: new Date().toISOString() }));
};