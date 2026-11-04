import {authFetch} from './authFetch';
export function incidentTransport(org,user,runtime){
 return async(url,options={})=>{
  if(!runtime)return authFetch(url,{...options,headers:{...options.headers,'x-incident-user':user}});
  const native=window.AndroidBridge||window.Android;
  if(!native?.incidentRequest)throw Object.assign(Error('android_update_required'),{status:426});
  const query=Object.fromEntries(new URL(url,window.location.origin).searchParams);
  return new Promise((resolve,reject)=>{
   const id=crypto.randomUUID();
   const done=e=>{if(e.detail?.id!==id)return;clearTimeout(timer);window.removeEventListener('geofield-incidents-response',done);resolve({ok:e.detail.status>=200&&e.detail.status<300,status:e.detail.status,json:async()=>JSON.parse(e.detail.body)});};
   const timer=setTimeout(()=>{window.removeEventListener('geofield-incidents-response',done);reject(Error('timeout'));},45000);
   window.addEventListener('geofield-incidents-response',done);
   try{native.incidentRequest(id,JSON.stringify({org_id:org,user_id:user,query,body:options.body?JSON.parse(options.body):null}));}catch(error){clearTimeout(timer);window.removeEventListener('geofield-incidents-response',done);reject(error);}
  });
 };
}
