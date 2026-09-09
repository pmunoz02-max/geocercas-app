// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ from: vi.fn(), fetch: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: m.from }) }));
vi.stubEnv('SUPABASE_URL', 'https://preview-test.supabase.co');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'mock-service');
vi.stubGlobal('fetch', m.fetch);
const handler = (await import('../../api/accept-tracker-invite.js')).default;
const org = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const invite = { id:'invite-test',org_id:org,is_active:true,expires_at:'2099-01-01' };
function response() { return { statusCode:200,status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;} }; }
function request(extra={}) { return {method:'POST',headers:{},body:{inviteToken:'test-token',org_id:org,...extra}}; }
beforeEach(() => {
 vi.clearAllMocks();
 m.from.mockImplementation(table => { if(table !== 'tracker_invites') throw new Error('Unexpected direct mutation/query'); return {select:()=>({eq:()=>({maybeSingle:async()=>({data:invite,error:null})})})}; });
 m.fetch.mockResolvedValue({ok:true,status:200,json:async()=>({ok:true,org_id:org,tracker_user_id:user,already_accepted:false,session:{access_token:'mock-runtime'}})});
});
describe('Web acceptance delegates to transactional Edge Function',()=>{
 it('uses canonical identity and adapts runtime session for Android',async()=>{
 const res=response(); await handler(request({user_id:'untrusted-owner'}),res);
 expect(res.statusCode).toBe(200); expect(res.body.tracker_user_id).toBe(user); expect(res.body.tracker_runtime_token).toBe('mock-runtime');
 expect(m.from).toHaveBeenCalledTimes(1);
 expect(JSON.parse(m.fetch.mock.calls[0][1].body)).toEqual({org_id:org,inviteToken:'test-token'});
 expect(m.fetch.mock.calls[0][0]).toBe('https://preview-test.supabase.co/functions/v1/accept-tracker-invite');
 });
 it('rejects a mismatched org before delegation',async()=>{const r=response();await handler(request({org_id:'other-org'}),r);expect(r.statusCode).toBe(409);expect(m.fetch).not.toHaveBeenCalled();});
 it.each([['plan_inactive',403],['tracker_user_id_not_resolved',409],['tracker_limit_reached',403]])('preserves %s rejection',async(error,status)=>{m.fetch.mockResolvedValue({ok:false,status,json:async()=>({error})});const r=response();await handler(request(),r);expect(r.statusCode).toBe(status);expect(r.body.error).toBe(error);});
 it('rejects success without a session',async()=>{m.fetch.mockResolvedValue({ok:true,status:200,json:async()=>({ok:true,org_id:org,tracker_user_id:user})});const r=response();await handler(request(),r);expect(r.statusCode).toBe(502);});
 it('preserves already accepted retries',async()=>{m.fetch.mockResolvedValue({ok:true,status:200,json:async()=>({ok:true,org_id:org,tracker_user_id:user,already_accepted:true,session:{access_token:'retry-runtime'}})});const r=response();await handler(request(),r);expect(r.body.already_accepted).toBe(true);expect(r.body.tracker_runtime_token).toBe('retry-runtime');});
});
