import crypto from 'node:crypto';
export const config = { runtime: 'nodejs' };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({ok:false,error:'method_not_allowed'});
 const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key) return res.status(503).json({ok:false,error:'service_unavailable'});
 let body; try { body=typeof req.body==='string'?JSON.parse(req.body):req.body; } catch { return res.status(400).json({ok:false,error:'invalid_request'}); }
 const {refresh_token,org_id,tracker_user_id,request_id}=body||{};
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(typeof refresh_token!=='string'||!/^[0-9a-f]{64}$/.test(refresh_token)||!uuid.test(org_id||'')||!uuid.test(tracker_user_id||'')||!uuid.test(request_id||'')) return res.status(400).json({ok:false,error:'invalid_request'});
 const auth=req.headers?.authorization; const access=typeof auth==='string'&&auth.startsWith('Bearer ')?auth.slice(7).trim():'';
 if(access.length>8192) return res.status(400).json({ok:false,error:'invalid_request'});
 const access_token=crypto.createHmac('sha256',refresh_token).update('tracker-access-v1:'+request_id).digest('hex');
 try {
  const response=await fetch(url.replace(/\/$/,'')+'/rest/v1/rpc/renew_tracker_runtime_session',{
   method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({p_access_hash:access?hash(access):null,p_refresh_hash:hash(refresh_token),p_new_access_hash:hash(access_token),p_org_id:org_id,p_tracker_user_id:tracker_user_id,p_request_id:request_id}),signal:AbortSignal.timeout(10000)});
  if(!response.ok) return res.status(503).json({ok:false,error:'renewal_unavailable'});
  const data=await response.json();
  if(data?.error==='request_expired') return res.status(409).json({ok:false,error:'renewal_request_expired'});
  if(data?.ok!==true) return res.status(403).json({ok:false,error:'session_not_renewable'});
  if(data.org_id!==org_id||data.tracker_user_id!==tracker_user_id) return res.status(503).json({ok:false,error:'renewal_unavailable'});
  return res.status(200).json({...data,access_token});
 } catch {return res.status(503).json({ok:false,error:'renewal_unavailable'});}
}
