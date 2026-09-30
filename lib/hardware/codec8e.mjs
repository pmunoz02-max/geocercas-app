import { createHash } from 'node:crypto';
export const MAX_FRAME = 1280;
export function crc16(bytes) {
  let crc = 0;
  for (const byte of bytes) { crc ^= byte; for (let i=0;i<8;i++) crc = (crc & 1) ? (crc >>> 1) ^ 0xa001 : crc >>> 1; }
  return crc;
}
export function decodeCodec8e(frame) {
  if (frame.length < 15 || frame.length > MAX_FRAME || frame.readUInt32BE(0) !== 0 || frame.readUInt32BE(4) !== frame.length-12) throw Error('invalid_frame');
  const data=frame.subarray(8,-4);
  if (frame.readUInt32BE(frame.length-4)!==crc16(data)) throw Error('invalid_crc');
  let p=0;
  const take=n=>{if(p+n>data.length)throw Error('truncated_record');const b=data.subarray(p,p+n);p+=n;return b;};
  const u8=()=>take(1)[0], u16=()=>take(2).readUInt16BE();
  if(u8()!==0x8e)throw Error('unsupported_codec');
  const count=u8(); if(!count)throw Error('empty_packet');
  const records=[];
  for(let i=0;i<count;i++) {
    const begin=p, timestamp=take(8).readBigUInt64BE();
    if(timestamp>8640000000000000n)throw Error('invalid_timestamp');
    const priority=u8(), longitude=take(4).readInt32BE()/1e7, latitude=take(4).readInt32BE()/1e7;
    const altitude=take(2).readInt16BE(), heading=u16(), satellites=u8(), speed=u16();
    if(priority>2||Math.abs(longitude)>180||Math.abs(latitude)>90||heading>360)throw Error('invalid_gps');
    const eventIoId=u16(), total=u16(), io={}; let found=0;
    function add(id,value) { if(Object.hasOwn(io,id))throw Error('duplicate_io');io[id]=value.toString('hex');found++; }
    for(const width of [1,2,4,8]) {const n=u16();for(let j=0;j<n;j++){const id=u16();add(id,take(width));}}
    const nx=u16();for(let j=0;j<nx;j++){const id=u16(),size=u16();add(id,take(size));}
    if(found!==total)throw Error('invalid_io_count');
    // Stable per-record identity survives reconnects and different packet grouping.
    const event_id='codec8e_'+createHash('sha256').update(data.subarray(begin,p)).digest('hex');
    const fix_valid=satellites>0;
    records.push({observation:{version:1,event_id,recorded_at:new Date(Number(timestamp)).toISOString(),fix_valid,...(fix_valid?{latitude,longitude}:{})},priority,altitude,heading,satellites,speed,eventIoId,io});
  }
  if(u8()!==count||p!==data.length)throw Error('invalid_record_count');
  return records;
}
