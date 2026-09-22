import {it,expect,vi,afterEach} from 'vitest';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetModules();});
for(const kind of ['expired','revoked','missing-membership']) it('rejects '+kind+' before position write',async()=>{
vi.stubEnv('SUPABASE_URL','https://example.invalid');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','test');
const row={id:'session',org_id:'org',tracker_user_id:'user',active:true,expires_at:new Date(Date.now()+(kind==='expired'?-60000:60000)).toISOString(),revoked_at:kind==='revoked'?new Date().toISOString():null};
const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>[row]}).mockResolvedValue({ok:true,json:async()=>[]});vi.stubGlobal('fetch',fetcher);
const {default:handler}=await import('../../api/send-position.js');const res={status:vi.fn().mockReturnThis(),json:vi.fn()};await handler({method:'POST',headers:{authorization:'Bearer mock'},body:{lat:0,lng:0}},res);
expect(res.status).toHaveBeenCalledWith(401);expect(fetcher.mock.calls.every(c=>(c[1]?.method||'GET')==='GET')).toBe(true);
});
