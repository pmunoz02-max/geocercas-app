import { createClient } from '@supabase/supabase-js';
import { uuid, normalizeVisit, identifyVisitActor, photoReceipt, readPhotoReceipt } from '../api-lib/visits.js';
import { isActiveAssignment } from '../api-lib/assignment-eligibility.js';
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method)) return res.status(405).json({error:'method_not_allowed'});
 try {
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  const org=req.method==='GET'?req.query?.org_id:body.org_id;
  if(!uuid(org)) return res.status(400).json({error:'invalid_org'});
  const token=(req.headers?.authorization||'').replace(/^Bearer /,'');
  if(!token) return res.status(401).json({error:'authentication_required'});
  const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const actor=await identifyVisitActor(db,token,org,req.headers?.['x-tracker-runtime']==='1');
  if(!actor) return res.status(403).json({error:'forbidden'});
  const check=result=>{if(result.error) throw new Error('database_unavailable');return result.data;};
  if(req.method==='GET') {
   const settings=check(await db.from('org_visit_settings').select('enabled').eq('org_id',org).maybeSingle());
   let query=db.from('field_visits').select('*').eq('org_id',org).order('started_at',{ascending:false}).limit(200);
   if(!actor.manager) query=query.eq('user_id',actor.userId);
   const visits=check(await query);
   for(const visit of visits) {
    visit.photo_urls={}; visit.photo_sizes={};
    for(const photo of visit.document?.photos || (visit.document?.photo?[visit.document.photo]:[])) {
     if(photo.size==null){const info=await db.storage.from('visit-evidence').info(`${org}/${visit.user_id}/${visit.id}/${photo.hash}`);if(Number.isFinite(info.data?.size))visit.photo_sizes[photo.hash]=info.data.size;}
     const signed=await db.storage.from('visit-evidence').createSignedUrl(`${org}/${visit.user_id}/${visit.id}/${photo.hash}`,300);
     visit.photo_urls[photo.hash]=signed.data?.signedUrl||null;
    }
    visit.photo_url=visit.photo_urls[visit.document?.photo?.hash]||null;
   }
   const geofences=check(await db.from('geofences').select('id,name').eq('org_id',org).eq('active',true));
   const personal=check(await db.from('personal').select('id,user_id,nombre,apellido').eq('org_id',org).eq('is_deleted',false));
   const assignments=check(await db.from('asignaciones').select('id,user_id,personal_id,geofence_id,start_time,end_time,status,estado,is_deleted,start_date,end_date').eq('org_id',org).eq('is_deleted',false));
   const own=assignments.filter(a=>isActiveAssignment(a)&&(a.user_id===actor.userId||personal.some(p=>p.id===a.personal_id&&p.user_id===actor.userId)));
   return res.status(200).json({enabled:settings?.enabled===true,manager:actor.manager,user_id:actor.userId,visits,geofences:actor.manager?geofences:geofences.filter(g=>own.some(a=>a.geofence_id===g.id)),assignments:own,people:actor.manager?personal:personal.filter(p=>p.user_id===actor.userId)});
  }
  if(body.action==='configure'&&!actor.manager) return res.status(403).json({error:'forbidden'});
  const existing=body.action==='configure'?null:check(await db.from('field_visits').select('document').eq('id',body.id).eq('org_id',org).eq('user_id',actor.userId).maybeSingle());
  const receiptScope=`${org}:${actor.userId}:${body.id}`;
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(body.action==='upload_photo') {
   if(!body.photo||body.photos) return res.status(400).json({error:'invalid_photo'});
   const normalized=normalizeVisit(body,existing?.document);
   const organization=check(await db.from('organizations').select('active,suspended').eq('id',org).maybeSingle());
   const setting=check(await db.from('org_visit_settings').select('enabled').eq('org_id',org).maybeSingle());
   if(!organization?.active||organization.suspended||(!setting?.enabled&&!existing))return res.status(403).json({error:'forbidden'});
   const upload=normalized.uploads[0];
   const saved=await db.storage.from('visit-evidence').upload(`${org}/${actor.userId}/${body.id}/${upload.metadata.hash}`,upload.bytes,{contentType:upload.metadata.type,upsert:true});
   if(saved.error)return res.status(503).json({error:'photo_pending'});
   return res.status(200).json({receipt:photoReceipt(upload.metadata,receiptScope,secret)});
  }
  const trusted=[...(existing?.document?.photos||(existing?.document?.photo?[existing.document.photo]:[]))];
  if(Array.isArray(body.photos))body.photos=body.photos.map(photo=>{
   if(!photo.receipt)return photo;
   const metadata=readPhotoReceipt(photo.receipt,receiptScope,secret);
   if(!trusted.some(p=>p.hash===metadata.hash))trusted.push(metadata);
   return {hash:metadata.hash};
  });
  const document=existing?.document||{};
  const parsed=body.action==='configure'?{data:{enabled:body.enabled}}:normalizeVisit(body,body.photos?{...document,photos:trusted}:document);
  const result=check(await db.rpc('save_field_visit',{p_org:org,p_user:actor.userId,p_action:body.action==='configure'?'configure':'save',p_data:parsed.data}));
  if(result.error) return res.status(409).json(result);
  for(const upload of parsed.uploads||[]) {
   const saved=await db.storage.from('visit-evidence').upload(`${org}/${actor.userId}/${body.id}/${upload.metadata.hash}`,upload.bytes,{contentType:upload.metadata.type,upsert:true});
   if(saved.error) return res.status(503).json({error:'photo_pending'});
  }
  return res.status(200).json(result);
 } catch(error) {
  const invalid=['photo_limit','photo_total_size','invalid_request','invalid_location','invalid_photo','purpose_required','text_too_long'].includes(error.message)||error instanceof SyntaxError;
  return res.status(invalid?400:503).json({error:invalid?error.message:'visits_unavailable'});
 }
}
