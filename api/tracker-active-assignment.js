// api/tracker-active-assignment.js
// Endpoint seguro para obtener la asignación activa del tracker

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed', message: 'Only POST allowed' });
  }

  const { authorization } = req.headers;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'missing_auth', message: 'Missing or invalid Authorization header' });
  }
  const jwt = authorization.replace('Bearer ', '').trim();

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

  // Consultar el usuario del JWT
  let userId;
  try {
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!userResp.ok) throw new Error('Invalid tracker JWT');
    const userData = await userResp.json();
    userId = userData.id;
    if (!userId) throw new Error('No user id in JWT');
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'invalid_jwt', message: e.message });
  }

  // Consultar tracker_assignments
  try {
    const query = [
      `org_id=eq.${encodeURIComponent(org_id)}`,
      'active=is.true',
      `tracker_user_id=eq.${encodeURIComponent(userId)}`,
    ].join('&');
    const url = `${SUPABASE_URL}/rest/v1/tracker_assignments?${query}&select=id,org_id,tracker_user_id,start_date,end_date,frequency_minutes,active`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    if (!resp.ok) throw new Error('Supabase REST error');
    const rows = await resp.json();
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
