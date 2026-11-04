import crypto from 'node:crypto';
import {location} from '../api-lib/visits.js';
export function incidentPhoto(photo){
 const invalid=()=>{throw {code:'22023',message:'invalid_photo'};};
 if(!photo||!['image/jpeg','image/png'].includes(photo.type)||typeof photo.base64!=='string'||photo.base64.length>2800000||!Number.isFinite(Date.parse(photo.attached_at))||Date.parse(photo.attached_at)>Date.now()+300000)invalid();
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(photo.base64))invalid();
 const bytes=Buffer.from(photo.base64,'base64');
 if(!bytes.length||bytes.length>2097152||bytes.toString('base64')!==photo.base64)invalid();
 if(photo.type==='image/jpeg'?!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255):!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))invalid();
 let point;try{point=location(photo.location);}catch{invalid();}
 return {bytes,meta:{sha256:crypto.createHash('sha256').update(bytes).digest('hex'),mime_type:photo.type,byte_size:bytes.length,attached_at:photo.attached_at,location:point}};
}
