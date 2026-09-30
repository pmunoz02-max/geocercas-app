import {crc16} from './codec8e.mjs';
export const SIM_IMEI='000000000000001';
export function hello(imei=SIM_IMEI){return Buffer.concat([Buffer.from([0,15]),Buffer.from(imei)]);}
export function simulatedFrame({timestamp=Date.now(),latitude=0.001,longitude=0.002,satellites=8}={}){
  const data=Buffer.alloc(41);data[0]=0x8e;data[1]=1;data.writeBigUInt64BE(BigInt(timestamp),2);
  data.writeInt32BE(Math.round(longitude*1e7),11);data.writeInt32BE(Math.round(latitude*1e7),15);data[23]=satellites;data[40]=1;
  const frame=Buffer.alloc(data.length+12);frame.writeUInt32BE(data.length,4);data.copy(frame,8);frame.writeUInt32BE(crc16(data),frame.length-4);return frame;
}
