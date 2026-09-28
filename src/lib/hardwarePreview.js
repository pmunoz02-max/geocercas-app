export function hardwarePreviewAllowed(host, url) {
  return url === 'https://mujwsfhkocsuuahlrssn.supabase.co' &&
    (host === 'preview.tugeocercas.com' || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app'));
}
export function routePoints(rows) {
  return rows.filter(p => p.fix_valid && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180)
    .sort((a,b) => (a.recorded_at > b.recorded_at ? 1 : a.recorded_at < b.recorded_at ? -1 : 0) || (a.event_id > b.event_id ? 1 : a.event_id < b.event_id ? -1 : 0) || ((a.device_id || '') > (b.device_id || '') ? 1 : (a.device_id || '') < (b.device_id || '') ? -1 : 0));
}
