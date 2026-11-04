import {incidentPhoto} from './photos.js';
import {createClient} from '@supabase/supabase-js';
import {identifyVisitActor,uuid} from '../api-lib/visits.js';
const errors=new Set(['invalid_photo','photo_limit','photo_pending','forbidden','module_disabled','invalid_geofence','invalid_visit','assignment_required','invalid_request','invalid_id','invalid_time','gps_required','invalid_note','unsupported_fields','invalid_observation','incident_closed','invalid_transition','reason_required','invalid_cursor','operation_conflict','version_conflict']);
export function incidentError(e){return {status:e?.code==='42501'?403:e?.code==='40001'||e?.code==='23505'?409:String(e?.code||'').startsWith('22')||['23514','23502'].includes(e?.code)?422:500,code:errors.has(e?.message)?e.message:'request_failed'};}
export function createIncidentHandler({makeDb,identify=identifyVisitActor,preview=()=>process.env.VERCEL_ENV==='preview'}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!preview())return res.status(404).json({error:'not_available'});
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'method_not_allowed'});
  let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:'invalid_request'});}
  const org=req.method==='GET'?req.query?.org_id:body?.org_id;
  if(!uuid(org))return res.status(400).json({error:'invalid_org'});
  const token=/^Bearer (.+)$/i.exec(req.headers?.authorization||'')?.[1];
  if(!token)return res.status(401).json({error:'authentication_required'});
  try{
   const db=makeDb(), actor=await identify(db,token,org,req.headers?.['x-tracker-runtime']==='1');
   if(actor&&req.headers?.['x-incident-user']&&req.headers['x-incident-user']!==actor.userId)return res.status(403).json({error:'forbidden'});
   if(!actor)return res.status(403).json({error:'forbidden'});
   const check=r=>{if(r.error)throw r.error;return r.data;};
   if(req.method==='POST'&&body.action==='upload_photo'){
    if(!uuid(body.id)||!uuid(body.observation_id)||!uuid(body.evidence_id))return res.status(400).json({error:'invalid_request'});
    const {bytes,meta}=incidentPhoto(body.photo);
    const reservation=check(await db.rpc('reserve_incident_evidence',{p_org:org,p_actor:actor.userId,p_incident:body.id,p_observation:body.observation_id,p_evidence:body.evidence_id,p_meta:meta}));
    if(!reservation.uploaded){
     const saved=await db.storage.from('incident-evidence').upload(reservation.object_path,bytes,{contentType:meta.mime_type,upsert:true});
     if(saved.error)return res.status(503).json({error:'photo_pending'});
     check(await db.rpc('finish_incident_evidence',{p_org:org,p_actor:actor.userId,p_evidence:body.evidence_id}));
    }
    return res.status(200).json({ok:true,id:body.evidence_id});
   }
   if(req.method==='POST'){
    if(!uuid(body.operation_id)||!['configure','create','observe','transition'].includes(body.action)||!body.data||typeof body.data!=='object'||Array.isArray(body.data))return res.status(400).json({error:'invalid_request'});
    if(['configure','transition'].includes(body.action)&&!actor.manager)return res.status(403).json({error:'forbidden'});
    return res.status(200).json(check(await db.rpc('save_incident_core',{p_org:org,p_actor:actor.userId,p_operation:body.operation_id,p_action:body.action,p_data:body.data})));
   }
   const id=req.query?.id||null,before=req.query?.before||null,beforeId=req.query?.before_id||null;
   if((id&&!uuid(id))||(!!before!==!!beforeId)||(before&&(!Number.isFinite(Date.parse(before))||!uuid(beforeId))))return res.status(400).json({error:'invalid_request'});
   const result=check(await db.rpc('read_incident_core',{p_org:org,p_actor:actor.userId,p_id:id,p_before:before,p_before_id:beforeId}));
   if(id){
    for(const photo of result.evidence||[]){
     if(photo.uploaded){const signed=await db.storage.from('incident-evidence').createSignedUrl(photo.object_path,300);photo.url=signed.data?.signedUrl||null;}
     delete photo.object_path;
    }
    return res.status(200).json(result);
   }
   let fences=check(await db.from('geofences').select('id,name').eq('org_id',org).eq('active',true).order('name'));
   if(!actor.manager){
    const people=check(await db.from('personal').select('id').eq('org_id',org).eq('user_id',actor.userId));
    const assignments=check(await db.from('asignaciones').select('geofence_id,user_id,personal_id,is_deleted,status,estado,start_time,end_time').eq('org_id',org));
    const now=Date.now();
    const allowed=new Set(assignments.filter(a=>a.is_deleted!==true&&['active','activa','activo'].includes(a.status??a.estado??'')&&(a.user_id===actor.userId||people.some(p=>p.id===a.personal_id))&&(!a.start_time||Date.parse(a.start_time)<=now)&&(!a.end_time||Date.parse(a.end_time)>=now)).map(a=>a.geofence_id));
    fences=fences.filter(g=>allowed.has(g.id));
   }
   const last=result.items?.length===100?result.items.at(-1):null;
   return res.status(200).json({...result,user_id:actor.userId,geofences:fences,next:last?{before:last.received_at,before_id:last.id}:null});
  }catch(e){const {status,code}=incidentError(e);return res.status(status).json({error:code});}
 };
}
export default createIncidentHandler({makeDb:()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})});
