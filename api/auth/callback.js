module.exports = async (req, res) => {
  const host = req.headers.host || "app.tugeocercas.com";
  const url = new URL(req.url, `https://${host}`);
  const next = url.searchParams.get("next") || "/inicio";
  res.statusCode = 302;
  res.setHeader("Location", `/login?next=${encodeURIComponent(next)}&err=diag_ok`);
  res.end();
};
