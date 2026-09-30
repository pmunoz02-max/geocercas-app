import net from 'node:net';
import {decodeCodec8e,MAX_FRAME} from './codec8e.mjs';
// Loopback-only simulator gateway. IMEI is identification, NOT authentication.
export function createCodec8eServer({devices,persist,idleMs=30000}) {
  if(!(devices instanceof Map)||typeof persist!=='function')throw Error('invalid_configuration');
  let connections=0;
  return net.createServer(socket=>{
    if(connections>=8){socket.destroy();return;} connections++;
    socket.once('close',()=>connections--);socket.on('error',()=>{});
    socket.setTimeout(idleMs,()=>socket.destroy());
    let buffer=Buffer.alloc(0),device=null,busy=false;
    async function pump(){
      if(busy)return;busy=true;socket.pause();
      try{
        while(!socket.destroyed){
          if(!device){
            if(buffer.length<2)break;
            if(buffer.readUInt16BE(0)!==15)throw Error('invalid_imei_length');
            if(buffer.length<17)break;
            const imei=buffer.subarray(2,17).toString('latin1');buffer=buffer.subarray(17);
            device=/^\d{15}$/.test(imei)?devices.get(imei):null;
            if(!device){socket.end(Buffer.from([0]));return;}
            socket.write(Buffer.from([1]));
          }
          if(buffer.length<8)break;
          const size=buffer.readUInt32BE(4)+12;
          if(buffer.readUInt32BE(0)!==0||size>MAX_FRAME||size<15)throw Error('invalid_frame');
          if(buffer.length<size)break;
          const records=decodeCodec8e(buffer.subarray(0,size));buffer=buffer.subarray(size);
          for(const record of records){
            const result=await persist(device,record.observation);
            if(!['stored','duplicate'].includes(result?.status))throw Error('persistence_failed');
          }
          // Partial commit or lost ACK: sender retries; persistent IDs deduplicate.
          if(!socket.destroyed){const ack=Buffer.alloc(4);ack.writeUInt32BE(records.length);socket.write(ack);}
        }
      }catch{socket.destroy();}finally{busy=false;if(!socket.destroyed)socket.resume();}
    }
    socket.on('data',chunk=>{if(buffer.length+chunk.length>MAX_FRAME*4){socket.destroy();return;}buffer=Buffer.concat([buffer,chunk]);void pump();});
  });
}
export async function listenCodec8e(server,port=0){
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return server.address().port;
}
