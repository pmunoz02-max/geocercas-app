// Bounded remote test: named simulated Preview pilot only, exits after about 190 seconds.
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createPreviewHardwareClient} from '../lib/hardware/preview-client.mjs';
import {hardwareHealth} from '../src/lib/hardwarePreview.js';
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const rpc=createPreviewHardwareClient({url,serviceKey:key,enabled:process.env.HARDWARE_PREVIEW_ENABLED});
const inventory=JSON.parse(fs.readFileSync(new URL('../docs/hardware-foundation-preview-installation.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
if(inventory.project_ref!=='mujwsfhkocsuuahlrssn'||!inventory.pilot.simulation_only) throw new Error('invalid_pilot');
const device=inventory.pilot.inventory[0].device_id, tracker=inventory.pilot.inventory[0].tracker_id;
const run='continuity-'+randomUUID(),checks=[];
const packet=(suffix,age=0,fix=true)=>({p_device_id:device,p_observation:{version:1,event_id:run+'-'+suffix,recorded_at:new Date(Date.now()-age*1000).toISOString(),fix_valid:fix,latitude:fix?0.001:null,longitude:fix?0.001:null}});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function latest(){
 const q=new URLSearchParams({select:'recorded_at,received_at,fix_valid,event_id',org_id:'eq.'+inventory.pilot.org_id,tracker_id:'eq.'+tracker,order:'received_at.desc',limit:'1'});
 const res=await fetch(url+'/rest/v1/hardware_observations?'+q,{headers:{apikey:key,Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!res.ok) throw new Error('read_failed_'+res.status);
 return (await res.json())[0];
}
async function check(expected){const row=await latest();const actual=hardwareHealth(row).code;if(actual!==expected)throw new Error('expected_'+expected+'_got_'+actual);checks.push({expected,actual,at:new Date().toISOString()});console.log('PASS',expected);return row;}
async function main(){
 await rpc('ingest_hardware_observation_preview',packet('online'));await check('online');
 await sleep(2000);
 const nofix=packet('no-fix',0,false);await rpc('ingest_hardware_observation_preview',nofix);const before=await check('no_fix');
 for(let i=0;i<6;i++){await sleep(30000);console.log('Pause',30*(i+1),'seconds');}
 await sleep(5000);
 const duplicate=await rpc('ingest_hardware_observation_preview',nofix);
 if(duplicate.status!=='duplicate'||Date.parse(duplicate.received_at)!==Date.parse(before.received_at))throw new Error('retry_refreshed_receipt');
 await check('offline');
 await rpc('ingest_hardware_observation_preview',packet('delayed',600));await check('delayed');
 await rpc('ingest_hardware_observation_preview',packet('recovered'));await check('online');
 fs.writeFileSync('docs/hardware-continuity-preview-validation.json',JSON.stringify({project_ref:inventory.project_ref,run,simulated:true,pause_seconds:185,duplicate_preserves_receipt:true,checks,passed:true,ended_at:new Date().toISOString()},null,2)+'\n');
}
main().catch(()=>{console.error('Continuity test failed; no credentials logged.');process.exitCode=1;});
