import { beforeEach, describe, expect, it, vi } from 'vitest';
const { db, state } = vi.hoisted(() => ({ db: { auth: { getUser: vi.fn() }, from: vi.fn() }, state: {} }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db }));
vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('SUPABASE_ANON_KEY', 'test');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service');
const handler = (await import('../../api/geofences.js')).default;
beforeEach(() => {
  state.missing = false; state.refs = false; state.writes = []; state.orgs = [];
  db.auth.getUser.mockResolvedValue({ data: { user: { id: 'user' } } });
  db.from.mockImplementation(table => {
    const filters = {}; let op = 'read';
    const chain = {
      select: () => chain, limit: () => chain, order: () => chain,
      is: () => chain, eq: (k,v) => { filters[k]=v; return chain; },
      delete: () => { op='delete'; return chain; },
      update: v => { op='update'; state.update=v; return chain; },
      maybeSingle: () => chain,
      then: (resolve,reject) => {
        let result = { count: state.refs ? 1 : 0, error: null };
        if (table === 'memberships') {
          state.orgs.push(filters.org_id);
          result = { data: state.missing ? null : { org_id: filters.org_id || 'wrong-default', role: 'owner' } };
        } else if (table === 'geofences') {
          result = { data: filters.id ? { id: filters.id, org_id: 'selected-org' } : [] };
          if (op !== 'read') state.writes.push(op);
        }
        return Promise.resolve(result).then(resolve,reject);
      }
    }; return chain;
  });
});
async function request(body) {
  const res = { setHeader() {}, end(value) { this.body=JSON.parse(value); } };
  await handler({ method:'POST', url:'/api/geofences', headers:{authorization:'Bearer test'}, body },res);
  return res;
}
describe('geofence deletion organization isolation', () => {
  it('uses the selected body organization instead of default membership', async () => {
    const res=await request({action:'delete',orgId:'selected-org',id:'geofence'});
    expect(res.statusCode).toBe(200); expect(state.orgs).toEqual(['selected-org']);
    expect(state.writes).toEqual(['delete']);
  });
  it('reads a string body once and resolves org_id', async () => {
    const res=await request(JSON.stringify({action:'delete',org_id:'selected-org',id:'geofence'}));
    expect(res.statusCode).toBe(200); expect(state.orgs).toEqual(['selected-org']);
  });
  it('rejects missing membership without falling back or writing', async () => {
    state.missing=true;
    const res=await request({action:'delete',orgId:'selected-org',id:'geofence'});
    expect(res.statusCode).toBe(403); expect(state.orgs.every(x=>x==='selected-org')).toBe(true);
    expect(state.writes).toEqual([]);
  });
  it('preserves referenced history by deactivating', async () => {
    state.refs=true;
    const res=await request({action:'delete',orgId:'selected-org',id:'geofence'});
    expect(res.body.mode).toBe('deactivated'); expect(state.writes).toEqual(['update']);
    expect(state.update.active).toBe(false);
  });
});

