// api/tracker-active-assignment.js
// Endpoint seguro para obtener la asignación activa del tracker

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed', message: 'Only POST allowed' });
  }

  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "missing_bearer_token" });
  }
  const jwt = authHeader.slice("Bearer ".length).trim();

  let org_id;
  try {
    ({ org_id } = req.body || {});
    if (!org_id) throw new Error('Missing org_id');
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'bad_request', message: 'Missing org_id in body' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ ok: false, error: 'missing_env', message: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' });
  }

  // Decodificar sub del JWT
  function decodeJwtPayload(token) {
    try {
      const part = String(token || "").split(".")[1];
      if (!part) return null;
      const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
      return JSON.parse(json);
    } catch {
      return null;
    }
  }
  const payload = decodeJwtPayload(jwt);
  const trackerUserId = payload?.sub;
  if (!trackerUserId) {
    return res.status(401).json({ ok: false, error: "invalid_tracker_jwt" });
  }

  console.log("[api/tracker-active-assignment] start", { hasAuth: !!authHeader, org_id });
  console.log("[api/tracker-active-assignment] tracker_user_id", trackerUserId);

  // Consultar tracker_assignments
  try {
    const query = [
      `org_id=eq.${encodeURIComponent(org_id)}`,
      `tracker_user_id=eq.${encodeURIComponent(trackerUserId)}`,
      `active=eq.true`,
    ].join('&');
    const url = `${SUPABASE_URL}/rest/v1/tracker_assignments?${query}&select=id,org_id,tracker_user_id,start_date,end_date,frequency_minutes,active`;
    const upstream = await fetch(url, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    console.log("[api/tracker-active-assignment] supabase_status", upstream.status);
    if (upstream.status === 401) {
      return res.status(401).json({ ok: false, error: "backend_error_401" });
    }
    if (!upstream.ok) {
      return res.status(500).json({ ok: false, error: 'backend_error', message: `Supabase REST error: ${upstream.status}` });
    }
    const rows = await upstream.json();
    // Determinar si hay asignación activa hoy
    const today = new Date();
    const todayISO = today.toISOString().slice(0, 10); // YYYY-MM-DD
    const active = rows.find(a => {
      return (
        a.start_date && a.end_date &&
        a.start_date <= todayISO &&
        a.end_date >= todayISO
      );
    });
    if (active) {
      return res.status(200).json({ ok: true, active: true, assignment: active });
    } else {
      return res.status(200).json({ ok: true, active: false, assignment: null });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'backend_error', message: e.message });
  }
}
