import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
const { visits, session } = vi.hoisted(() => ({ visits: vi.fn(), session: vi.fn() }));
vi.mock('../../server/visits/index.js', () => ({ default: visits }));
vi.mock('../../server/auth/_session.js', () => ({ default: session }));
import handler, { config } from '../../api/auth/index.js';
describe('shared visits deployment route', () => {
 it('routes visits before the generic API rule', () => {
  const { routes } = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const first = routes.find(r => r.src && new RegExp('^' + r.src + '$').test('/api/visits'));
  expect(first.dest).toBe('/api/auth?route=visits');
  expect(config.api.bodyParser.sizeLimit).toBe('3mb');
 });
 it('delegates the original request including credentials and photo body', async () => {
  const req = { method: 'POST', query: { route: 'visits' }, headers: { authorization: 'Bearer test' }, body: { org_id: 'org', photo: {} } };
  const res = {};
  await handler(req, res);
  expect(visits).toHaveBeenCalledWith(req, res);
 });
 it('keeps the existing session route separate', async () => {
  const req = { query: { route: 'session' } }; const res = {};
  await handler(req, res);
  expect(session).toHaveBeenCalledWith(req, res);
 });
 it('rejects unlisted routes', async () => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await handler({ query: { route: '../visits' } }, res);
  expect(res.status).toHaveBeenCalledWith(404);
 });
});
