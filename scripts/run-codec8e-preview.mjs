import fs from 'node:fs';
import net from 'node:net';
import {once} from 'node:events';
import dotenv from 'dotenv';
import {createPreviewHardwareClient} from '../lib/hardware/preview-client.mjs';
import {createCodec8eServer,listenCodec8e} from '../lib/hardware/codec8e-server.mjs';
import {simulatedFrame,hello,SIM_IMEI} from '../lib/hardware/codec8e-simulator.mjs';
const env=dotenv.parse(fs.readFileSync(new URL('../.env.preview.check',import.meta.url)));
const inventory=JSON.parse(fs.readFileSync(new URL('../docs/hardware-foundation-preview-installation.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
if(inventory.project_ref!=='mujwsfhkocsuuahlrssn'||!inventory.pilot.simulation_only||inventory.pilot.org_id!=='28b86cea-e91d-4926-8770-755fbc31a5d1')throw Error('wrong_pilot');
const rpc=createPreviewHardwareClient({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,enabled:'true'});
const statuses=[];
const server=createCodec8eServer({devices:new Map([[SIM_IMEI,inventory.pilot.inventory[0].device_id]]),persist:async(device,observation)=>{const result=await rpc('ingest_hardware_observation_preview',{p_device_id:device,p_observation:observation});statuses.push(result.status);return result;}});
const port=await listenCodec8e(server);const packet=simulatedFrame();
try {
 for(let i=0;i<2;i++){
  const s=net.connect(port,'127.0.0.1');s.setTimeout(20000,()=>s.destroy());s.on('error',()=>{});
  try{await once(s,'connect');s.write(Buffer.concat([hello(),packet]));let reply=Buffer.alloc(0);for await(const chunk of s){reply=Buffer.concat([reply,chunk]);if(reply.length>=5)break;}if(reply.toString('hex')!=='0100000001')throw Error('invalid_ack');}finally{s.destroy();}
 }
 if(statuses.join(',')!=='stored,duplicate')throw Error('unexpected_statuses');
 console.log(JSON.stringify({project:inventory.project_ref,transport:'loopback TCP Codec8E to Preview RPC',statuses,passed:true}));
}finally{server.close();}
