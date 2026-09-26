import crypto from 'node:crypto';
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function location(value) {
 if (value == null) return null;
 if (!Number.isFinite(value.lat)||!Number.isFinite(value.lng)||Math.abs(value.lat)>90||Math.abs(value.lng)>180||!Number.isFinite(value.accuracy)||value.accuracy<0||!Number.isFinite(Date.parse(value.captured_at))) throw new Error('invalid_location');
 return { lat:value.lat,lng:value.lng,accuracy:value.accuracy,captured_at:value.captured_at,source:'device_reported' };
}
export function normalizeVisit(body, existingDocument = {}, existingSizes = {}) {
 if (!uuid(body.id)||!uuid(body.geofence_id)||(body.assignment_id && !uuid(body.assignment_id))) throw new Error('invalid_request');
 const text=(value,max)=> { if (value!=null && typeof value!=='string') throw new Error('invalid_request'); if((value||'').length>max) throw new Error('text_too_long'); return (value||'').trim(); };
 const document={purpose:text(body.purpose,200),notes:text(body.notes,4000),outcome:text(body.outcome,2000),follow_up:text(body.follow_up,2000),start_location:location(body.start_location),end_location:location(body.end_location)};
 if(!document.purpose) throw new Error('purpose_required');
 const existingPhotos=existingDocument.photos || (existingDocument.photo?[existingDocument.photo]:[]);
 const explicit=Object.hasOwn(body,'photos');
 if(explicit && (!Array.isArray(body.photos)||body.photo)) throw new Error('invalid_photo');
 const items=explicit?body.photos:(body.photo?[body.photo]:existingPhotos.map(p=>({hash:p.hash})));
 if(items.length>5) throw new Error('photo_limit');
 const uploads=[];let total=0;
 const photos=items.map(item=>{
  if(!item||typeof item!=='object') throw new Error('invalid_photo');
  if(!item.base64){const saved=existingPhotos.find(p=>p.hash===item.hash);if(!saved)throw new Error('invalid_photo');total+=saved.size??existingSizes[saved.hash]??2097152;return saved;}
  if(!['image/jpeg','image/png'].includes(item.type)||typeof item.base64!=='string'||item.base64.length>2800000)throw new Error('invalid_photo');
  const bytes=Buffer.from(item.base64,'base64');
  const valid=item.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(!valid||bytes.length>2097152||!Number.isFinite(Date.parse(item.attached_at)))throw new Error('invalid_photo');
  total+=bytes.length;
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');
  const metadata=existingPhotos.find(p=>p.hash===hash)||{hash,type:item.type,size:bytes.length,attached_at:item.attached_at,location:location(item.location),source:'attachment_location_not_verified_capture'};
  uploads.push({bytes,metadata});return metadata;
 });
 if(total>5*2097152)throw new Error('photo_total_size');
 // Keep legacy documents identical for closed-visit retries from older clients.
 if(!explicit && !existingDocument.photos){if(photos.length)document.photo=photos[0];}
 else document.photos=photos;
 return {data:{id:body.id,geofence_id:body.geofence_id,assignment_id:body.assignment_id||null,started_at:body.started_at,ended_at:body.ended_at||null,document},uploads,photo:uploads[0]?.bytes||null};
}
export async function identifyVisitActor(db,token,orgId,runtime=false) {
 let userId;
 if(runtime) {
  const {data,error}=await db.from('tracker_runtime_sessions').select('org_id,tracker_user_id,expires_at,revoked_at').eq('access_token_hash',crypto.createHash('sha256').update(token).digest('hex')).eq('active',true).maybeSingle();
  if(error||!data||data.org_id!==orgId||data.revoked_at||!(Date.parse(data.expires_at)>Date.now())) return null;
  userId=data.tracker_user_id;
 } else {
  const {data,error}=await db.auth.getUser(token);
  if(error||!data?.user) return null;
  userId=data.user.id;
 }
 const {data,error}=await db.from('memberships').select('role').eq('org_id',orgId).eq('user_id',userId).is('revoked_at',null).maybeSingle();
 if(error||!data||(runtime && data.role!=='tracker')) return null;
 return {userId,manager:!runtime&&['owner','admin'].includes(data.role)};
}

export function photoReceipt(metadata, scope, secret) {
 const value=Buffer.from(JSON.stringify({metadata,scope,expires:Date.now()+86400000})).toString('base64url');
 return value+'.'+crypto.createHmac('sha256',secret).update(value).digest('base64url');
}
export function readPhotoReceipt(receipt, scope, secret) {
 if(typeof receipt!=='string'||receipt.length>4096)throw new Error('invalid_photo');
 const [value,signature]=receipt.split('.');
 const expected=crypto.createHmac('sha256',secret).update(value).digest();
 const actual=Buffer.from(signature||'','base64url');
 if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))throw new Error('invalid_photo');
 const parsed=JSON.parse(Buffer.from(value,'base64url').toString());
 if(parsed.scope!==scope||parsed.expires<Date.now())throw new Error('invalid_photo');
 return parsed.metadata;
}
