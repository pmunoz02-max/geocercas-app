import {test} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {once} from 'node:events';
import {decodeCodec8e,crc16} from './codec8e.mjs';
import {createCodec8eServer,listenCodec8e} from './codec8e-server.mjs';
import {simulatedFrame,hello,SIM_IMEI} from './codec8e-simulator.mjs';
const official='000000000000004A8E010000016B412CEE000100000000000000000000000000000000010005000100010100010011001D00010010015E2C880002000B000000003544C87A000E000000001DD7E06A00000100002994';
function wrap(data){const f=Buffer.alloc(data.length+12);f.writeUInt32BE(data.length,4);data.copy(f,8);f.writeUInt32BE(crc16(data),f.length-4);return f;}
function batch(frames){return wrap(Buffer.concat([Buffer.from([0x8e,frames.length]),...frames.map(f=>f.subarray(10,-5)),Buffer.from([frames.length])]));}
test('variable length IO and independent record IDs in repackaged batches',()=>{
 const f=simulatedFrame({timestamp:1000});const data=Buffer.from(f.subarray(8,-4));data.writeUInt16BE(1,28);data.writeUInt16BE(1,38);
 const extended=wrap(Buffer.concat([data.subarray(0,-1),Buffer.from('01000003616263','hex'),Buffer.from([1])]));
 assert.equal(decodeCodec8e(extended)[0].io[256],'616263');
 const other=simulatedFrame({timestamp:2000});const records=decodeCodec8e(batch([f,other]));assert.equal(records.length,2);assert.deepEqual(records[0],decodeCodec8e(f)[0]);
});
test('partial committed batch retries without duplicate rows',async t=>{
 const rows=new Set();let attempt=0;
 const server=createCodec8eServer({devices:new Map([[SIM_IMEI,'device']]),persist:async(d,o)=>{if(++attempt===2)throw Error('connection_lost');const status=rows.has(o.event_id)?'duplicate':'stored';rows.add(o.event_id);return {status};}});
 const port=await listenCodec8e(server);t.after(()=>server.close());const packet=batch([simulatedFrame({timestamp:1000}),simulatedFrame({timestamp:2000})]);
 const s=await connect(port);t.after(()=>s.destroy());s.write(hello());await read(s,1);s.write(packet);assert.equal((await read(s,4)).length,0);assert.equal(rows.size,1);
 const retry=await connect(port);t.after(()=>retry.destroy());retry.write(hello());await read(retry,1);retry.write(packet);assert.equal((await read(retry,4)).readUInt32BE(),2);assert.equal(rows.size,2);
});
test('official Teltonika vector: CRC, fixed IO widths, timestamp and no fix',()=>{
 const [r]=decodeCodec8e(Buffer.from(official,'hex'));assert.equal(r.observation.recorded_at,'2019-06-10T11:36:32.000Z');assert.equal(r.observation.fix_valid,false);assert.equal(Object.keys(r.io).length,5);assert.equal(r.io[17],'001d');assert.equal(r.io[11],'000000003544c87a');
});
test('signed coordinates and stable identity',()=>{const f=simulatedFrame({latitude:-0.07,longitude:-78.46});const a=decodeCodec8e(f)[0].observation;assert.equal(a.latitude,-0.07);assert.equal(a.longitude,-78.46);assert.deepEqual(decodeCodec8e(f)[0].observation,a);});
test('corrupt/truncated/oversized/unsupported data rejected',()=>{const f=simulatedFrame();for(let i=0;i<f.length;i++)assert.throws(()=>decodeCodec8e(f.subarray(0,i)));const bad=Buffer.from(f);bad[10]^=1;assert.throws(()=>decodeCodec8e(bad),/crc/);const codec=Buffer.from(f);codec[8]=8;codec.writeUInt32BE(crc16(codec.subarray(8,-4)),codec.length-4);assert.throws(()=>decodeCodec8e(codec),/codec/);assert.throws(()=>decodeCodec8e(Buffer.alloc(1281)));});
test('mismatched record count rejected even with valid CRC',()=>{const f=simulatedFrame();f[f.length-5]=2;f.writeUInt32BE(crc16(f.subarray(8,-4)),f.length-4);assert.throws(()=>decodeCodec8e(f),/count/);});
async function connect(port){const s=net.connect(port,'127.0.0.1');s.on('error',()=>{});await once(s,'connect');return s;}
async function read(s,n){let b=Buffer.alloc(0);for await(const chunk of s.iterator({destroyOnReturn:false})){b=Buffer.concat([b,chunk]);if(b.length>=n)return b;}return b;}
test('TCP fragmented handshake/frame and replay across reconnect; ACK after commit',async t=>{
 const rows=new Map();let release;const gate=new Promise(r=>release=r);let calls=0;
 const server=createCodec8eServer({devices:new Map([[SIM_IMEI,'device']]),persist:async(d,o)=>{calls++;await gate;const status=rows.has(o.event_id)?'duplicate':'stored';rows.set(o.event_id,o);return {status};}});
 const port=await listenCodec8e(server);t.after(()=>server.close());const s=await connect(port);t.after(()=>s.destroy());
 const h=hello();s.write(h.subarray(0,1));s.write(h.subarray(1));assert.equal((await read(s,1))[0],1);
 const f=simulatedFrame();let received=false;s.once('data',()=>received=true);s.write(f.subarray(0,9));s.write(f.subarray(9));
 await new Promise(r=>setTimeout(r,30));assert.equal(received,false);release();assert.equal((await read(s,4)).readUInt32BE(),1);s.destroy();
 const s2=await connect(port);t.after(()=>s2.destroy());s2.write(Buffer.concat([hello(),f,f]));assert.equal((await read(s2,9)).toString('hex'),'010000000100000001');assert.equal(rows.size,1);assert.equal(calls,3);
});
test('unknown identity rejected and persistence failure never ACKs',async t=>{
 const server=createCodec8eServer({devices:new Map([[SIM_IMEI,'device']]),persist:async()=>{throw Error('offline');}});const port=await listenCodec8e(server);t.after(()=>server.close());
 const unknown=await connect(port);t.after(()=>unknown.destroy());unknown.write(hello('000000000000002'));assert.equal((await read(unknown,1))[0],0);
 const s=await connect(port);t.after(()=>s.destroy());s.write(hello());await read(s,1);s.write(simulatedFrame());assert.equal((await read(s,4)).length,0);
});
