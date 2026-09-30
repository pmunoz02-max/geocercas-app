import fs from 'node:fs';
import tls from 'node:tls';
import http from 'node:http';
import {createCodec8eServer} from '../lib/hardware/codec8e-server.mjs';
import {validateGatewayConfig} from '../lib/hardware/gateway-config.mjs';
import {createPreviewHardwareClient} from '../lib/hardware/preview-client.mjs';

// No dotenv or environment-selected destination. Deployment secrets are mounted files.
const root=process.env.GATEWAY_SECRETS_DIR||'/run/secrets';
const read=name=>fs.readFileSync(root+'/'+name);
try {
 const c=validateGatewayConfig(JSON.parse(read('gateway_config')));
 const rpc=createPreviewHardwareClient({url:c.projectUrl,serviceKey:read('supabase_key').toString().trim(),enabled:'true'});
 const fingerprints=new Map(c.devices.map(d=>[d.imei,d.fingerprint256]));
 const stats={packet_committed:0,packet_failed:0,tls_rejected:0};let ready=false;
 const gateway=createCodec8eServer({devices:new Map(c.devices.map(d=>[d.imei,d.deviceId])),
  serverFactory:handler=>tls.createServer({key:read('tls_key'),cert:read('tls_cert'),ca:read('client_ca'),minVersion:'TLSv1.2',requestCert:true,rejectUnauthorized:true,handshakeTimeout:10000},handler),
  authorize:(socket,imei)=>socket.authorized&&socket.getPeerCertificate().fingerprint256===fingerprints.get(imei),
  persist:(device,observation)=>rpc('ingest_hardware_observation_preview',{p_device_id:device,p_observation:observation}),
  onEvent:event=>{stats[event]++;}
 });
 gateway.on('tlsClientError',()=>stats.tls_rejected++);
 gateway.on('error',()=>{console.error('gateway_listener_failed');process.exit(1);});
 // Host publishes only TLS port; health endpoint stays within container loopback.
 const health=http.createServer((req,res)=>{res.writeHead(ready?200:503,{'Content-Type':'application/json'});res.end(JSON.stringify({ready,mode:'simulation',...stats}));});
 health.on('error',()=>process.exit(1));
 health.listen(8080,'127.0.0.1');gateway.listen(5027,'0.0.0.0',()=>{ready=true;console.log('preview_gateway_listening');});
 const timer=setInterval(()=>console.log(JSON.stringify({event:'gateway_counters',...stats})),60000);
 function stop(){ready=false;clearInterval(timer);gateway.close();health.close();setTimeout(()=>process.exit(0),20000).unref();}
 process.once('SIGTERM',stop);process.once('SIGINT',stop);
}catch{console.error('gateway_configuration_failed');process.exitCode=1;}
