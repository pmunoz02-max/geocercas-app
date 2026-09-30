import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateGatewayConfig,PREVIEW_URL} from './gateway-config.mjs';
const config=()=>({projectUrl:PREVIEW_URL,mode:'simulation',devices:[{imei:'000000000000001',deviceId:'fe0bb5fb-d262-458e-8305-2c15b46c4920',fingerprint256:Array(32).fill('AB').join(':')}]});
test('gateway accepts only isolated pilot with pinned certificate',()=>{assert.equal(validateGatewayConfig(config()).devices.length,1);});
test('gateway refuses Production, real IMEI, malformed pins and duplicate mapping',()=>{
 for(const mutate of [c=>c.projectUrl='https://wpaixkvokdkudymgjoua.supabase.co',c=>c.mode='physical',c=>c.devices[0].imei='356307042441013',c=>c.devices[0].fingerprint256='',c=>c.devices.push({...c.devices[0]})]){const c=config();mutate(c);assert.throws(()=>validateGatewayConfig(c));}
});
