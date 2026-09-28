// Pure simulator contract; does not authenticate or persist observations.
const keys = new Set(['version','event_id','recorded_at','fix_valid','latitude','longitude']);
export function normalizeObservation(input, { now = Date.now(), retentionDays = 30 } = {}) {
  if (!Number.isFinite(now) || !Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) throw new Error('invalid_policy');
  if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(k => !keys.has(k))) throw new Error('invalid_fields');
  if (input.version !== 1 || typeof input.event_id !== 'string' || !/^[a-zA-Z0-9_-]{1,96}$/.test(input.event_id)) throw new Error('invalid_event');
  // Canonical UTC only: excludes ambiguous local times and impossible calendar dates.
  const time = typeof input.recorded_at === 'string' ? Date.parse(input.recorded_at) : NaN;
  if (!Number.isFinite(time) || new Date(time).toISOString() !== input.recorded_at) throw new Error('invalid_time');
  if (time > now + 120000) throw new Error('future_time');
  if (time <= now - retentionDays * 86400000) throw new Error('expired_observation');
  if (typeof input.fix_valid !== 'boolean') throw new Error('invalid_fix');
  const lat = input.latitude, lon = input.longitude;
  if (input.fix_valid) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) throw new Error('invalid_coordinates');
  } else if (lat != null || lon != null) throw new Error('coordinates_without_fix');
  return { version: 1, event_id: input.event_id, recorded_at: input.recorded_at, fix_valid: input.fix_valid, latitude: lat ?? null, longitude: lon ?? null };
}
// Ordering is device-time then stable event ID; receipt time never makes a retry newer.
export function compareObservations(a, b) {
  return a.recorded_at === b.recorded_at ? (a.event_id > b.event_id ? 1 : a.event_id < b.event_id ? -1 : 0) : (a.recorded_at > b.recorded_at ? 1 : -1);
}
