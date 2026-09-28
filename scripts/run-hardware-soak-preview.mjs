// 24-hour backend-only HTTP soak. State/queue contains synthetic data, never credentials.
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {randomUUID} from 'node:crypto';
import {createPreviewHardwareClient} from '../lib/hardware/preview-client.mjs';
const dir=process.argv[2];
if(!dir)throw new Error('state_directory_required');
fs.mkdirSync(dir,{recursive:true});
const statePath=path.join(dir,'state.json'),lockPath=path.join(dir,'runner.lock');
if(fs.existsSync(lockPath)){
 const pid=Number(fs.readFileSync(lockPath,'utf8'));
 try{process.kill(pid,0);throw new Error('runner_already_active');}catch(e){if(e.code!=='ESRCH')throw e;}
 fs.unlinkSync(lockPath);
}
fs.writeFileSync(lockPath,String(process.pid),{flag:'wx'});
const env=dotenv.parse(fs.readFileSync(new URL('../.env.preview.check',import.meta.url)));
const url=env.SUPABASE_URL,key=env.SUPABASE_SERVICE_ROLE_KEY;
const rpc=createPreviewHardwareClient({url,serviceKey:key,enabled:'true'});
const inventory=JSON.parse(fs.readFileSync(new URL('../docs/hardware-foundation-preview-installation.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
if(inventory.project_ref!=='mujwsfhkocsuuahlrssn'||!inventory.pilot.simulation_only)throw new Error('wrong_pilot');
let state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):{run:'soak-'+randomUUID(),project:inventory.project_ref,startedAt:new Date().toISOString(),nextTick:0,queue:[],ack:[],errors:[],gaps:[],outageTicks:[],duplicateChecks:0,latest:{},status:'running'};
if(state.project!==inventory.project_ref||state.status!=='running')throw new Error('state_not_resumable');
const start=Date.parse(state.startedAt),end=start+86400000;
state.endsAt=new Date(end).toISOString();state.pid=process.pid;
function save(){state.updatedAt=new Date().toISOString();fs.writeFileSync(statePath+'.tmp',JSON.stringify(state,null,2));fs.renameSync(statePath+'.tmp',statePath);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function read(resource,params){
 const r=await fetch(url+'/rest/v1/'+resource+'?'+new URLSearchParams(params),{headers:{apikey:key,Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error('read_http_'+r.status);return r.json();
}
function outage(tick){const n=tick%240;return n>=30&&n<35;}
async function checkLatest(){
 for(const item of inventory.pilot.inventory){
 const rows=await read('rpc/hardware_latest_preview',{p_org_id:inventory.pilot.org_id,p_tracker_id:item.tracker_id});
 const t=rows[0]?.recorded_at;
 if(t&&state.latest[item.tracker_id]&&Date.parse(t)<Date.parse(state.latest[item.tracker_id]))throw new Error('latest_position_regressed');
 if(t)state.latest[item.tracker_id]=t;
 }
}
async function drain(){
 // Newest first on recovery: old queued fixes must never roll back the latest fix.
 while(state.queue.length){
 const item=state.queue.at(-1);
 const result=await rpc('ingest_hardware_observation_preview',item);
 if(!['stored','duplicate'].includes(result.status))throw new Error('unexpected_ack');
 state.ack.push({device_id:item.p_device_id,event_id:item.p_observation.event_id,recorded_at:item.p_observation.recorded_at,received_at:result.received_at});
 state.queue.pop();save();
 await checkLatest();
 }
}
async function verify(){
 let count=0;
 for(const device of inventory.pilot.inventory){
  const rows=[];
  for(let offset=0;;offset+=500){
   const batch=await read('hardware_observations',{select:'event_id,recorded_at,received_at',device_id:'eq.'+device.device_id,event_id:'like.'+state.run+'-*',order:'event_id.asc',limit:'500',offset:String(offset)});
   rows.push(...batch);if(batch.length<500)break;
  }
  const expected=state.ack.filter(a=>a.device_id===device.device_id);
  const byId=new Map(rows.map(r=>[r.event_id,r]));
  if(rows.length!==expected.length||byId.size!==rows.length||expected.some(a=>!byId.has(a.event_id)||Date.parse(byId.get(a.event_id).recorded_at)!==Date.parse(a.recorded_at)||Date.parse(byId.get(a.event_id).received_at)!==Date.parse(a.received_at)))throw new Error('stored_rows_mismatch');
  count+=rows.length;
 }
 state.verifiedRows=count;state.verifiedAt=new Date().toISOString();save();
}
async function main(){
 save();
 while(Date.now()<end){
  const tick=Math.floor((Date.now()-start)/60000);
  if(tick<state.nextTick){await sleep(Math.min(10000,start+state.nextTick*60000-Date.now()));continue;}
  if(tick>state.nextTick)state.gaps.push({from:state.nextTick,to:tick-1,reason:'runner_did_not_execute'});
  const recordedAt=new Date().toISOString();
  for(const [index,d] of inventory.pilot.inventory.entries())state.queue.push({p_device_id:d.device_id,p_observation:{version:1,event_id:state.run+'-'+String(tick).padStart(4,'0'),recorded_at:recordedAt,fix_valid:true,latitude:0.001+index*.001+Math.sin(tick/10)*.001,longitude:0.001+Math.cos(tick/10)*.001}});
  state.nextTick=tick+1;save();
  if(outage(tick)){state.outageTicks.push(tick);save();continue;}
  try{
   // Replay one acknowledged event every hour with its original content, before draining.
   if(tick%60===0&&state.lastPacket){
    const retry=await rpc('ingest_hardware_observation_preview',state.lastPacket.packet);
    if(retry.status!=='duplicate'||Date.parse(retry.received_at)!==Date.parse(state.lastPacket.receivedAt))throw new Error('duplicate_changed_receipt');
    state.duplicateChecks++;
   }
   const newest=state.queue.at(-1);
   await drain();
   if(newest){const ack=state.ack.find(a=>a.device_id===newest.p_device_id&&a.event_id===newest.p_observation.event_id);state.lastPacket={packet:newest,receivedAt:ack.received_at};}
   if(tick%60===0)await verify();
  }catch(e){state.errors.push({at:new Date().toISOString(),code:/^(hardware_|read_http_|latest_|stored_|duplicate_|unexpected_)/.test(e.message)?e.message:'operation_failed'});}
  save();
 }
 await drain();await verify();
 state.finishedAt=new Date().toISOString();state.status=state.gaps.length||state.errors.length||state.ack.length!==2880?'completed_with_issues':'passed';save();
}
main().catch(()=>{state.status='failed';state.failure='runner_failed_review_logs';save();process.exitCode=1;}).finally(()=>{fs.unlinkSync(lockPath);});
