import crypto from 'node:crypto';
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function location(value) {
 if (value == null) return null;
 if (!Number.isFinite(value.lat)||!Number.isFinite(value.lng)||Math.abs(value.lat)>90||Math.abs(value.lng)>180||!Number.isFinite(value.accuracy)||value.accuracy<0||!Number.isFinite(Date.parse(value.captured_at))) throw new Error('invalid_location');
 return { lat:value.lat,lng:value.lng,accuracy:value.accuracy,captured_at:value.captured_at,source:'device_reported' };
}
export function normalizeVisit(body) {
 if (!uuid(body.id)||!uuid(body.geofence_id)||(body.assignment_id && !uuid(body.assignment_id))) throw new Error('invalid_request');
 const text=(value,max)=> { if (value!=null && typeof value!=='string') throw new Error('invalid_request'); if((value||'').length>max) throw new Error('text_too_long'); return (value||'').trim(); };
 const document={purpose:text(body.purpose,200),notes:text(body.notes,4000),outcome:text(body.outcome,2000),follow_up:text(body.follow_up,2000),start_location:location(body.start_location),end_location:location(body.end_location)};
 if(!document.purpose) throw new Error('purpose_required');
 let photo=null;
 if(body.photo) {
  if(!['image/jpeg','image/png'].includes(body.photo.type)||typeof body.photo.base64!=='string'||body.photo.base64.length>2800000) throw new Error('invalid_photo');
  photo=Buffer.from(body.photo.base64,'base64');
  const valid=body.photo.type==='image/jpeg'?photo[0]===255&&photo[1]===216&&photo[2]===255:photo.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(!valid||photo.length>2097152) throw new Error('invalid_photo');
  if(!Number.isFinite(Date.parse(body.photo.attached_at))) throw new Error('invalid_photo');
  document.photo={hash:crypto.createHash('sha256').update(photo).digest('hex'),type:body.photo.type,attached_at:body.photo.attached_at,location:location(body.photo.location),source:'attachment_location_not_verified_capture'};
 }
 return {data:{id:body.id,geofence_id:body.geofence_id,assignment_id:body.assignment_id||null,started_at:body.started_at,ended_at:body.ended_at||null,document},photo};
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
