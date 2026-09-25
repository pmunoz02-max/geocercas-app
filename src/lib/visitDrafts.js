const DB='geofield-visit-drafts-v1';
async function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function visitDrafts(scope){const db=await database();try{return await new Promise((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').getAll();r.onsuccess=()=>resolve(r.result.filter(v=>v.scope===scope));r.onerror=()=>reject(r.error);});}finally{db.close();}}
export async function putVisitDraft(scope,body){const db=await database();try{await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({key:scope+':'+body.id,scope,body,revision:crypto.randomUUID()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
export async function acknowledgeVisit(draft){const db=await database();try{await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite'),s=tx.objectStore('drafts'),r=s.get(draft.key);r.onsuccess=()=>{if(r.result?.revision===draft.revision)s.delete(draft.key);};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
export async function deviceLocation(){return new Promise(resolve=>{if(!navigator.geolocation)return resolve(null);navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,captured_at:new Date(p.timestamp).toISOString()}),()=>resolve(null),{enableHighAccuracy:true,timeout:10000,maximumAge:0});});}
export async function prepareVisitPhoto(file){
 if(!['image/jpeg','image/png'].includes(file.type)||file.size>2097152)throw new Error('photo_size');
 const [base64,location]=await Promise.all([new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(r.error);r.readAsDataURL(file);}),deviceLocation()]);
 return {base64,type:file.type,location,attached_at:new Date().toISOString()};
}
export function csvCell(value){let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
