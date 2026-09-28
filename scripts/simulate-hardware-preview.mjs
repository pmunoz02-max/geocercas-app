import { normalizeObservation, compareObservations } from '../lib/hardware/observation.mjs';
// Local-only fixture: no network, credentials, database writes or production target.
const now = Date.parse('2026-09-27T12:00:00.000Z');
const event = (id, offset, extra = {}) => ({ version: 1, event_id: id, recorded_at: new Date(now + offset).toISOString(), fix_valid: true, latitude: -0.1, longitude: -78.4, ...extra });
const packets = [event('run1-001', -60000), event('run1-003', 0), event('run1-001', -60000), event('run1-002', -30000), event('run1-004', 0, { fix_valid: false, latitude: null, longitude: null }), event('run1-005', 180000), event('run1-006', 0, { latitude: 91 }), event('run1-001', -60000, { longitude: 0 })];
const history = new Map(); let latest = null;
const results = packets.map(packet => {
  try {
    const item = normalizeObservation(packet, { now });
    const previous = history.get(item.event_id);
    if (previous) return { event_id: item.event_id, result: JSON.stringify(previous) === JSON.stringify(item) ? 'duplicate' : 'idempotency_conflict' };
    history.set(item.event_id, item);
    if (item.fix_valid && (!latest || compareObservations(item, latest) > 0)) latest = item;
    return { event_id: item.event_id, result: 'accepted_locally' };
  } catch (error) { return { event_id: packet.event_id, result: error.message }; }
});
console.log(JSON.stringify({ mode: 'local_simulation_only', persisted: false, results, observations: history.size, latest }, null, 2));
