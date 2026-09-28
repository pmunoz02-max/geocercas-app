import { describe, it, expect } from 'vitest';
import { normalizeObservation as normalize, compareObservations } from '../../lib/hardware/observation.mjs';
const now = Date.parse('2026-09-27T12:00:00.000Z');
const base = { version: 1, event_id: 'boot1-1', recorded_at: new Date(now).toISOString(), fix_valid: true, latitude: 0, longitude: 0 };
const run = patch => normalize({ ...base, ...patch }, { now });
describe('hardware observation contract', () => {
 it('accepts zero coordinates without inventing accuracy', () => expect(run({})).toEqual(base));
 it.each([null, '2', NaN, Infinity, 91, -91])('rejects invalid latitude %s', latitude => expect(() => run({ latitude })).toThrow('invalid_coordinates'));
 it.each([181, -181, '0', null])('rejects invalid longitude %s', longitude => expect(() => run({ longitude })).toThrow('invalid_coordinates'));
 it.each(['org_id','tracker_id','device_id','received_at'])('rejects payload-selected %s', key => expect(() => run({ [key]: 'forged' })).toThrow('invalid_fields'));
 it('rejects future and expired points', () => {
   expect(() => run({ recorded_at: new Date(now + 120001).toISOString() })).toThrow('future_time');
   expect(() => run({ recorded_at: new Date(now - 30 * 86400000).toISOString() })).toThrow('expired_observation');
 });
 it.each(['2026-02-30T12:00:00.000Z','2026-09-27T12:00:00','invalid'])('rejects ambiguous or invalid dates %s', recorded_at => expect(() => run({ recorded_at })).toThrow('invalid_time'));
 it('allows no-fix communication without a position', () => expect(run({ fix_valid: false, latitude: null, longitude: null }).latitude).toBeNull());
 it('rejects coordinates without fix', () => expect(() => run({ fix_valid: false })).toThrow('coordinates_without_fix'));
 it('orders late points behind current state and retries equally', () => {
   const late = run({ recorded_at: new Date(now - 1000).toISOString() });
   expect(compareObservations(late, base)).toBe(-1);
   expect(compareObservations(base, run({}))).toBe(0);
   expect(compareObservations(run({ event_id: 'boot1-2' }), base)).toBe(1);
 });
 it('rejects invalid policy', () => expect(() => normalize(base, { now, retentionDays: 0 })).toThrow('invalid_policy'));
});
