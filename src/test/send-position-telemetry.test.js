import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let handler, fetcher, inserted;
const req = body => ({ method: 'POST', headers: { authorization: 'Bearer mock-runtime' }, body: { lat: 0, lng: 0, accuracy: 4.7, ...body } });
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('SUPABASE_URL', 'https://example.invalid');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  inserted = null;
  fetcher = vi.fn(async (url, options = {}) => {
    const path = new URL(url).pathname;
    let rows;
    if (path.endsWith('/tracker_runtime_sessions')) rows = [{ id: 'session', org_id: 'org', tracker_user_id: 'user', active: true, expires_at: new Date(Date.now()+60000).toISOString() }];
    else if (path.endsWith('/memberships')) rows = [{user_id:'user'}];
    else if (path.endsWith('/personal')) rows = [{id:'person'}];
    else if (path.endsWith('/asignaciones')) rows = [{id:'assignment',org_id:'org',user_id:'user',personal_id:'person',geofence_id:'geofence',status:'active'}];
    else if (path.endsWith('/geofences')) rows = [{id:'geofence',org_id:'org',lat:0,lng:0,radius_m:100,active:true}];
    else if (path.endsWith('/tracker_positions') && options.method === 'POST') { inserted = JSON.parse(options.body)[0]; rows = [{id:'position'}]; }
    else throw new Error('Unexpected request '+path);
    return {ok:true,status:200,json:async()=>rows,text:async()=>JSON.stringify(rows)};
  });
  vi.stubGlobal('fetch', fetcher);
  handler = (await import('../../api/send-position.js')).default;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe('optional speed and heading persistence', () => {
  it.each([{speed:1.25,heading:182.5},{speed:0,heading:0},{speed:10000,heading:359.999}])('persists valid telemetry %j',async body=>{
    const res=response(); await handler(req(body),res);
    expect(res.status).toHaveBeenCalledWith(200);expect(res.json).toHaveBeenCalledWith({ok:true});
    expect(inserted).toMatchObject({...body,accuracy:4.7,org_id:'org',user_id:'user'});
  });
  it.each([{}, {speed:null,heading:null}])('keeps old clients and explicit null compatible %j',async body=>{
    const res=response();await handler(req(body),res);expect(res.status).toHaveBeenCalledWith(200);expect(inserted).toMatchObject({speed:null,heading:null});
  });
  it.each([{speed:0},{heading:0}])('preserves zero and leaves the other field null %j',async body=>{
    const res=response();await handler(req(body),res);expect(res.status).toHaveBeenCalledWith(200);expect(inserted).toMatchObject({speed:null,heading:null,...body});
  });
  for (const [field,values] of Object.entries({speed:[-1,NaN,Infinity,-Infinity,'1','',true,[],{}],heading:[-1,360,720,NaN,Infinity,-Infinity,'90','',false,[],{}]})) {
    it.each(values)('rejects invalid '+field+' %j before geofence lookup or insert',async value=>{
      const res=response();await handler(req({[field]:value}),res);
      expect(res.status).toHaveBeenCalledWith(400);expect(res.json).toHaveBeenCalledWith({ok:false,error:'invalid_'+field});expect(inserted).toBeNull();
      expect(fetcher.mock.calls.some(([url])=>/\/(personal|asignaciones|geofences|tracker_positions)(\?|$)/.test(url))).toBe(false);
    });
  }
  it('accepts a serialized JSON request with decimal telemetry',async()=>{
    const request=req({speed:2.75,heading:270});request.body=JSON.stringify(request.body);const res=response();await handler(request,res);expect(inserted).toMatchObject({speed:2.75,heading:270});
  });
  it('retains runtime authentication for requests containing telemetry',async()=>{
    const request=req({speed:0,heading:0});request.headers={};const res=response();await handler(request,res);expect(res.status).toHaveBeenCalledWith(401);expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps the geofence gate and does not insert valid telemetry outside it',async()=>{
    const res=response();await handler({...req({speed:3,heading:90}),body:{lat:1,lng:1,speed:3,heading:90}},res);expect(res.status).toHaveBeenCalledWith(200);expect(res.json).toHaveBeenCalledWith({ok:true,stored:false,reason:'outside_assigned_geofence'});expect(inserted).toBeNull();
  });
});
