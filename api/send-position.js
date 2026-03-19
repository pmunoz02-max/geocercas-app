export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks).toString("utf8");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return res.status(500).json({ ok: false, error: "missing_supabase_env" });
    }

    const authHeader = req.headers.authorization || "";
    const upstreamUrl = `${supabaseUrl}/functions/v1/send_position`;

    console.log("[api/send-position] proxy_start", {
      hasAuth: Boolean(authHeader),
      bodyLength: rawBody.length,
      upstreamUrl,
    });

    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: authHeader,
      },
      body: rawBody,
    });

    const text = await upstream.text();
    const contentType =
      upstream.headers.get("content-type") || "application/json; charset=utf-8";

    console.log("[api/send-position] proxy_end", {
      status: upstream.status,
      ok: upstream.ok,
      responseLength: text.length,
    });

    res.status(upstream.status);
    res.setHeader("Content-Type", contentType);
    return res.send(text);
  } catch (error) {
    console.error("[api/send-position] proxy_error", {
      message: error?.message,
      stack: error?.stack,
    });

    return res.status(500).json({
      ok: false,
      error: "proxy_failed",
      message: error?.message || "unknown_error",
    });
  }
}