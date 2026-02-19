// api/auth/index.js
// Único endpoint para /api/auth/* (Hobby friendly)

import bootstrap from "../../server/auth/_bootstrap";
import ensureContext from "../../server/auth/_ensure-context";
import magic from "../../server/auth/_magic";
import password from "../../server/auth/_password";
import recover from "../../server/auth/_recover";
import session from "../../server/auth/_session";

export default async function handler(req, res) {
  const route = String(req.query?.route || "").trim();

  if (route === "bootstrap") return bootstrap(req, res);
  if (route === "ensure-context") return ensureContext(req, res);
  if (route === "magic") return magic(req, res);
  if (route === "password") return password(req, res);
  if (route === "recover") return recover(req, res);
  if (route === "session") return session(req, res);

  return res.status(404).json({
    ok: false,
    error: "AUTH_ROUTE_NOT_FOUND",
    got: route,
    expected: ["bootstrap", "ensure-context", "magic", "password", "recover", "session"]
  });
}
