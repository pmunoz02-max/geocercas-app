// Generates synthetic points near (0,0), unrelated to any person or real journey.
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
const file=process.argv[2];
if(!file || process.argv.length!==3) throw new Error('Usage: node scripts/generate-hardware-route.mjs <new-batch.json>');
const inventory=JSON.parse(fs.readFileSync(new URL('../docs/hardware-foundation-preview-installation.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
if(inventory.project_ref!=='mujwsfhkocsuuahlrssn'||!inventory.pilot.simulation_only) throw new Error('invalid_preview_pilot');
const run='route-'+randomUUID(); const now=Date.now();
const route=[[0,0],[.001,0],[.002,.001],[.003,.002],[.004,.003],[.004,.004],[.003,.005],[.002,.005],[.001,.004],[0,.003],[0,.002],[0,.001]];
const batch=inventory.pilot.inventory.flatMap((device,index)=>route.map(([lat,lon],i)=>({device_id:device.device_id,observation:{version:1,event_id:run+'-'+String(i).padStart(2,'0'),recorded_at:new Date(now-(route.length-i)*10000).toISOString(),fix_valid:true,latitude:lat+index*.001,longitude:lon+index*.001}})));
fs.writeFileSync(file,JSON.stringify(batch,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({file,observations:batch.length,simulated:true}));
