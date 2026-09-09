// @vitest-environment node
import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), auth: vi.fn(), sign: vi.fn(),
  runtimeUpdate: vi.fn(), runtimeInsert: vi.fn(), runtimeSelect: vi.fn(), subject: vi.fn() }));
vi.mock('https://deno.land/std@0.224.0/http/server.ts', () => ({ serve: vi.fn() }));
vi.mock('https://esm.sh/@supabase/supabase-js@2.45.4', () => ({
  createClient: () => ({ rpc: m.rpc, from: m.from, auth: { admin: { getUserById: m.auth } } }),
}));
vi.mock('https://esm.sh/jose@5.9.6', () => ({ SignJWT: class {
  setProtectedHeader() { return this; } setSubject(id) { m.subject(id); return this; }
  setIssuedAt() { return this; } setExpirationTime() { return this; }
  sign() { return m.sign(); }
} }));
const env = { SUPABASE_URL:'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY:'mock-only', JWT_SECRET:'mock-jwt-secret' };
vi.stubGlobal('Deno', { env: { get: key => env[key] ?? '' } });
vi.stubGlobal('crypto', { subtle: { digest: async () => new Uint8Array(32).fill(1) } });
const { handleAcceptTrackerInvite } = await import('../../supabase/functions/accept-tracker-invite/index.ts');
afterAll(() => vi.unstubAllGlobals());
const org='22222222-2222-4222-8222-222222222222', user='33333333-3333-4333-8333-333333333333';
const accepted = () => ({ ok:true, org_id:org, tracker_user_id:user,
  invite_id:'11111111-1111-4111-8111-111111111111', accepted_at:'2026-09-09T12:00:00Z', already_accepted:false });
let member, memberError;
function chain(result) { const q={ eq:()=>q, select:()=>q, single:()=>Promise.resolve(result),
  maybeSingle:()=>Promise.resolve(result), then:(yes,no)=>Promise.resolve(result).then(yes,no) }; return q; }
function request(extra={}) { return new Request('https://example.com/accept', { method:'POST',
  headers:{'content-type':'application/json'}, body:JSON.stringify({ inviteToken:'test-token',org_id:org,...extra }) }); }
function noSession() { expect(m.sign).not.toHaveBeenCalled(); expect(m.runtimeUpdate).not.toHaveBeenCalled();
  expect(m.runtimeInsert).not.toHaveBeenCalled(); expect(m.runtimeSelect).not.toHaveBeenCalled(); }
beforeEach(() => {
  vi.resetAllMocks(); env.JWT_SECRET='mock-jwt-secret';
  member={org_id:org,user_id:user,role:'tracker',revoked_at:null}; memberError=null;
  m.rpc.mockImplementation(async name => {
    if(name==='resolve_tracker_user_id') return {data:'44444444-4444-4444-8444-444444444444',error:null};
    if(name!=='accept_tracker_invite_transactional') throw Error('Legacy RPC called');
    return {data:accepted(),error:null};
  });
  m.auth.mockResolvedValue({data:{user:{id:user,email:'tracker@example.invalid'}},error:null});
  m.sign.mockResolvedValue('mock-signed-token');
  m.runtimeUpdate.mockImplementation(()=>chain({error:null}));
  m.runtimeInsert.mockImplementation(()=>chain({data:{id:'runtime-test',token_version:1},error:null}));
  m.runtimeSelect.mockImplementation(()=>chain({data:[{id:'runtime-test'}],error:null}));
  m.from.mockImplementation(table => {
    if(table==='memberships') return {select:()=>chain({data:member,error:memberError})};
    if(table==='tracker_runtime_sessions') return {update:m.runtimeUpdate,insert:m.runtimeInsert,select:m.runtimeSelect};
    throw Error('Unexpected table/write: '+table);
  });
});
describe('acceptance RPC endpoint integration', () => {
  it.each([
    ['tracker_user_id_not_resolved',409],['invite_not_found',404],['invite_expired',410],
    ['invite_inactive',409],['invite_identity_mismatch',409],['inviting_org_owner_protected',409],
    ['plan_unavailable',503],['plan_inactive',403],['tracker_limit_reached',403],
    ['invite_already_used_or_inconsistent',409],['accepted_membership_not_active_tracker',403],
  ])('rejects %s without legacy resolution, invite writes or JWT', async (error,status) => {
    m.rpc.mockResolvedValue({data:null,error:{code:'P0001',message:error}});
    const res=await handleAcceptTrackerInvite(request());
    expect(res.status).toBe(status); expect((await res.json()).error).toBe(error);
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith('accept_tracker_invite_transactional',
      {p_org_id:org,p_invite_token:'test-token',p_expected_user_id:null});
    expect(m.auth).not.toHaveBeenCalled(); expect(m.from).not.toHaveBeenCalled(); noSession();
  });
  it.each([null,{}, {ok:false}, {org_id:'wrong'}, {tracker_user_id:'bad'}, {already_accepted:null}, {accepted_at:'bad'}])
  ('rejects malformed RPC result %j', async patch => {
    const data=patch===null?null:Object.keys(patch).length===0?{}:{...accepted(),...patch};
    m.rpc.mockResolvedValue({data,error:null}); const res=await handleAcceptTrackerInvite(request());
    expect(res.status).toBe(500); expect((await res.json()).error).toBe('invalid_acceptance_result');noSession();
  });
  it.each([false,true])('issues a session after RPC success (retry=%s)', async retry => {
    m.rpc.mockResolvedValue({data:{...accepted(),already_accepted:retry},error:null});
    const res=await handleAcceptTrackerInvite(request({user_id:'untrusted-client-user'}));const body=await res.json();
    expect(res.status).toBe(200);expect(body.already_accepted).toBe(retry);expect(body.tracker_user_id).toBe(user);
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith('accept_tracker_invite_transactional',
      {p_org_id:org,p_invite_token:'test-token',p_expected_user_id:null});
    expect(m.auth).toHaveBeenCalledWith(user);expect(m.subject).toHaveBeenCalledWith(user);
    expect(m.runtimeInsert).toHaveBeenCalledTimes(1);
    expect(m.rpc.mock.invocationCallOrder[0]).toBeLessThan(m.sign.mock.invocationCallOrder[0]);
    expect(m.from.mock.calls.every(([t])=>['memberships','tracker_runtime_sessions'].includes(t))).toBe(true);
  });
  it('does not accept an invite when JWT configuration is missing', async () => {
    env.JWT_SECRET='';const res=await handleAcceptTrackerInvite(request());expect(res.status).toBe(500);
    expect(m.rpc).not.toHaveBeenCalled();noSession();
  });
  it.each(['40P01','40001','55P03'])('maps transaction retry %s without leaking details', async code => {
    m.rpc.mockResolvedValue({data:null,error:{code,message:'private SQL detail'}});
    const res=await handleAcceptTrackerInvite(request()); const body=await res.json();
    expect(res.status).toBe(503);expect(body.retryable).toBe(true);expect(JSON.stringify(body)).not.toContain('private');noSession();
  });
  it('hides unknown database errors',async()=>{
    m.rpc.mockResolvedValue({data:null,error:{code:'XX000',message:'private detail'}});
    const res=await handleAcceptTrackerInvite(request());expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('private');noSession();
  });
  it('rejects an unavailable Auth identity after acceptance',async()=>{
    m.auth.mockResolvedValue({data:null,error:{message:'unavailable'}});
    const res=await handleAcceptTrackerInvite(request());expect(res.status).toBe(503);noSession();
  });
  it('rejects a membership revoked after acceptance',async()=>{
    member.revoked_at='2026-09-09T12:01:00Z';const res=await handleAcceptTrackerInvite(request());expect(res.status).toBe(403);noSession();
  });
  it('rejects a membership lookup error',async()=>{
    memberError={message:'unavailable'};const res=await handleAcceptTrackerInvite(request());expect(res.status).toBe(503);noSession();
  });
  it('can retry a session failure through the same idempotent RPC',async()=>{
    m.sign.mockRejectedValueOnce(Error('mock signing failure'));
    const first=await handleAcceptTrackerInvite(request());expect(first.status).toBe(500);
    expect(m.runtimeInsert).not.toHaveBeenCalled();
    m.rpc.mockResolvedValue({data:{...accepted(),already_accepted:true},error:null});
    const second=await handleAcceptTrackerInvite(request());expect(second.status).toBe(200);
    expect(m.rpc).toHaveBeenCalledTimes(2);expect(m.runtimeInsert).toHaveBeenCalledTimes(1);
  });
});
