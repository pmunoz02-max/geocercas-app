export function hardwarePreviewAllowed(host, url) {
  return url === 'https://mujwsfhkocsuuahlrssn.supabase.co' &&
    (host === 'preview.tugeocercas.com' || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app'));
}
export function routePoints(rows) {
  return rows.filter(p => p.fix_valid && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180)
    .sort((a,b) => (a.recorded_at > b.recorded_at ? 1 : a.recorded_at < b.recorded_at ? -1 : 0) || (a.event_id > b.event_id ? 1 : a.event_id < b.event_id ? -1 : 0) || ((a.device_id || '') > (b.device_id || '') ? 1 : (a.device_id || '') < (b.device_id || '') ? -1 : 0));
}
export function hardwareHealth(observation, now = Date.now(), expectedSeconds = 60) {
  if (!Number.isFinite(now) || !Number.isFinite(expectedSeconds) || expectedSeconds <= 0) return {code:'unknown',label:'Estado no disponible'};
  if (!observation) return {code:'empty',label:'Sin datos'};
  const received = Date.parse(observation.received_at), recorded = Date.parse(observation.recorded_at);
  if (!Number.isFinite(received) || !Number.isFinite(recorded) || received > now + 120000 || recorded > now + 120000) return {code:'unknown',label:'Estado no disponible'};
  const tolerance = expectedSeconds * 3 * 1000;
  if (now-received > tolerance) return {code:'offline',label:'Sin comunicación'};
  if (observation.fix_valid === false) return {code:'no_fix',label:'Sin señal GPS'};
  if (observation.fix_valid !== true) return {code:'unknown',label:'Estado no disponible'};
  if (now-recorded > tolerance) return {code:'delayed',label:'Posición atrasada'};
  return {code:'online',label:'En línea'};
}
