export const PREVIEW_URL='https://mujwsfhkocsuuahlrssn.supabase.co';
const PILOT_DEVICES=new Set(['fe0bb5fb-d262-458e-8305-2c15b46c4920','fa80a1e1-d24b-4a49-9343-63f762a9e0f9']);
export function validateGatewayConfig(c){
 if(c.projectUrl!==PREVIEW_URL||c.mode!=='simulation')throw Error('preview_simulation_only');
 if(!Array.isArray(c.devices)||!c.devices.length||c.devices.length>2)throw Error('invalid_devices');
 const imeis=new Set(),ids=new Set(),fingerprints=new Set();
 for(const d of c.devices){
  if(!/^00000000000000[12]$/.test(d.imei)||!PILOT_DEVICES.has(d.deviceId)||!/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(d.fingerprint256))throw Error('invalid_device');
  if(imeis.has(d.imei)||ids.has(d.deviceId)||fingerprints.has(d.fingerprint256))throw Error('duplicate_device');
  imeis.add(d.imei);ids.add(d.deviceId);fingerprints.add(d.fingerprint256);
 }
 return c;
}
