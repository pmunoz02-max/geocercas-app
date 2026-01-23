// api/auth/callback.js  (ESM)
// Diagnóstico: si esto NO responde, el dominio no está sirviendo este repo o hay routing raro.

export const config = { runtime: "nodejs" };

export default function handler(req, res) {
  res.statusCode = 200;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end("CALLBACK_OK_V1");
}
