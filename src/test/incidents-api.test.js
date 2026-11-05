import {describe,it,expect,vi,beforeEach} from 'vitest';
import {createIncidentHandler} from '../../server/incidents/index.js';
import fs from 'node:fs';
const org='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
let db,identify,handler;
function response(){return {setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};}
function req(extra={}){return {method:'GET',query:{org_id:org},headers:{authorization:'Bearer session'},...extra};}
beforeEach(()=>{db={rpc:vi.fn().mockResolvedValue({data:{items:[],enabled:false,manager:true}}),from:vi.fn(table=>{const q={select:()=>q,eq:vi.fn(()=>q),order:()=>q,then:resolve=>Promise.resolve({data:[]}).then(resolve)};return q;})};identify=vi.fn().mockResolvedValue({userId:user,manager:true});handler=createIncidentHandler({makeDb:()=>db,identify,preview:()=>true});});
it('rejects production before creating a client',async()=>{const makeDb=vi.fn();const res=response();await createIncidentHandler({makeDb,preview:()=>false})(req(),res);expect(res.status).toHaveBeenCalledWith(404);expect(makeDb).not.toHaveBeenCalled();});
it('rejects missing credentials without database calls',async()=>{const res=response();await handler(req({headers:{}}),res);expect(res.status).toHaveBeenCalledWith(401);expect(db.rpc).not.toHaveBeenCalled();});
it('rejects invalid membership without reading records',async()=>{identify.mockResolvedValue(null);const res=response();await handler(req(),res);expect(res.status).toHaveBeenCalledWith(403);expect(db.rpc).not.toHaveBeenCalled();});
it('uses verified actor rather than body user_id',async()=>{db.rpc.mockResolvedValue({data:{ok:true}});const res=response();await handler(req({method:'POST',body:{org_id:org,user_id:id,operation_id:id,action:'create',data:{id}}}),res);expect(db.rpc).toHaveBeenCalledWith('save_incident_core',expect.objectContaining({p_org:org,p_actor:user,p_operation:id}));expect(res.status).toHaveBeenCalledWith(200);});
it('denies tracker configure/transition before RPC',async()=>{identify.mockResolvedValue({userId:user,manager:false});for(const action of ['configure','transition']){const res=response();await handler(req({method:'POST',body:{org_id:org,operation_id:id,action,data:{}}}),res);expect(res.status).toHaveBeenCalledWith(403);}expect(db.rpc).not.toHaveBeenCalled();});
it('passes detail identity to protected RPC and never queries catalogs',async()=>{db.rpc.mockResolvedValue({data:{incident:{id}}});await handler(req({query:{org_id:org,id}}),response());expect(db.rpc).toHaveBeenCalledWith('read_incident_core',expect.objectContaining({p_id:id,p_actor:user,p_org:org}));expect(db.from).not.toHaveBeenCalled();});
it('returns conflicts without SQL details',async()=>{db.rpc.mockResolvedValue({error:{code:'40001',message:'version_conflict',details:'secret'}});const res=response();await handler(req(),res);expect(res.status).toHaveBeenCalledWith(409);expect(res.json).toHaveBeenCalledWith({error:'version_conflict'});});
it('rejects malformed JSON and incomplete cursors',async()=>{for(const r of [req({method:'POST',body:'{'}),req({query:{org_id:org,before:'2026-11-04T00:00:00Z'}})]){const res=response();await handler(r,res);expect(res.status).toHaveBeenCalledWith(400);}expect(db.rpc).not.toHaveBeenCalled();});
it('does not expose arbitrary database error text',async()=>{db.rpc.mockResolvedValue({error:{message:'database password internal'}});const res=response();await handler(req(),res);expect(res.json).toHaveBeenCalledWith({error:'request_failed'});});
it('routes incidents before generic API without replacing visits',()=>{const {routes}=JSON.parse(fs.readFileSync('vercel.json','utf8'));expect(routes.find(r=>r.src&&new RegExp('^'+r.src+'$').test('/api/incidents')).dest).toBe('/api/auth?route=incidents');expect(routes.find(r=>r.src==='/api/visits').dest).toBe('/api/auth?route=visits');});

it('reserves evidence before Storage and finalizes only after upload',async()=>{
 const upload=vi.fn().mockResolvedValue({data:{}});db.storage={from:()=>({upload})};db.rpc.mockResolvedValue({data:{object_path:'private/slot',uploaded:false}});
 const res=response();await handler(req({method:'POST',body:{org_id:org,action:'upload_photo',id,observation_id:id,evidence_id:id,photo:{type:'image/png',base64:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64'),attached_at:new Date().toISOString()}}}),res);
 expect(db.rpc.mock.calls.map(c=>c[0])).toEqual(['reserve_incident_evidence','finish_incident_evidence']);expect(upload).toHaveBeenCalledTimes(1);expect(res.status).toHaveBeenCalledWith(200);
});
it('never uploads an unauthorized reservation',async()=>{
 db.rpc.mockResolvedValue({error:{code:'42501',message:'forbidden'}});db.storage={from:vi.fn()};const res=response();await handler(req({method:'POST',body:{org_id:org,action:'upload_photo',id,observation_id:id,evidence_id:id,photo:{type:'image/png',base64:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64'),attached_at:new Date().toISOString()}}}),res);expect(res.status).toHaveBeenCalledWith(403);expect(db.storage.from).not.toHaveBeenCalled();
});
it('rejects disguised images and identity switches before writing',async()=>{
 const res=response();await handler(req({method:'POST',body:{org_id:org,action:'upload_photo',id,observation_id:id,evidence_id:id,photo:{type:'image/png',base64:Buffer.from('<script>').toString('base64'),attached_at:new Date().toISOString()}}}),res);expect(res.status).toHaveBeenCalledWith(422);expect(db.rpc).not.toHaveBeenCalled();
 const changed=response();await handler(req({headers:{authorization:'Bearer session','x-incident-user':id}}),changed);expect(changed.status).toHaveBeenCalledWith(403);
});

it('denies reports to trackers before reading data',async()=>{
 identify.mockResolvedValue({userId:user,manager:false});
 const res=response();
 await handler(req({query:{org_id:org,report:'1'}}),res);
 expect(res.status).toHaveBeenCalledWith(403);
 expect(db.rpc).not.toHaveBeenCalled();
});
it('keeps reports Preview-only until promotion is authorized',async()=>{
 const previous=process.env.VERCEL_ENV;
 process.env.VERCEL_ENV='production';
 try {
  const res=response();
  await handler(req({query:{org_id:org,report:'1'}}),res);
  expect(res.status).toHaveBeenCalledWith(404);
  expect(db.rpc).not.toHaveBeenCalled();
 } finally {if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous;}
});

it('report labels use only names from the selected organization and preserve the cursor',async()=>{
 const previous=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 const eq=vi.fn(),inside=vi.fn();
 const q={select:()=>q,eq:(...args)=>{eq(...args);return q;},in:(...args)=>{inside(...args);return q;},order:()=>Promise.resolve({data:[{user_id:user,nombre:'Ana',apellido:'Pérez'}]})};
 db.from.mockReturnValue(q);
 db.rpc.mockResolvedValue({data:{items:Array.from({length:100},(_,n)=>({id:String(n),author_id:user,received_at:'2026-11-05T00:00:00Z'}))}});
 try {
  const res=response();await handler(req({query:{org_id:org,report:'1'}}),res);
  expect(eq).toHaveBeenCalledWith('org_id',org);
  expect(inside).toHaveBeenCalledWith('user_id',[user]);
  expect(res.json.mock.calls[0][0].items[0].author_name).toBe('Ana Pérez');
  expect(res.json.mock.calls[0][0].next.before_id).toBe('99');
 } finally {if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous;}
});
