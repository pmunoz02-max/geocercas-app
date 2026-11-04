export const INCIDENT_DB='geofield-incidents-v1';
const DB=INCIDENT_DB;
async function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('records',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function transact(mode,fn){const d=await db();try{return await new Promise((resolve,reject)=>{const tx=d.transaction('records',mode);let value;const r=fn(tx.objectStore('records'));if(r)r.onsuccess=()=>{value=r.result;};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('storage_failed'));});}finally{d.close();}}
export const incidentScope=(org,user)=>org&&user?org+':'+user:null;
export async function enqueueIncident(scope,operation,photos=[]){if(!scope)throw Error('identity_required');const entry={key:scope+':queue:'+operation.operation_id,scope,kind:'queue',operation,photos,created:Date.now()};await transact('readwrite',s=>s.put(entry));return entry;}
export async function incidentQueue(scope){return (await transact('readonly',s=>s.getAll())).filter(x=>x.scope===scope&&x.kind==='queue').sort((a,b)=>a.created-b.created);}
export const removeIncidentEntry=entry=>transact('readwrite',s=>s.delete(entry.key));
export const cacheIncidentContext=(scope,value)=>transact('readwrite',s=>s.put({key:scope+':context',value:{...value,items:[],next:null}}));
export const cachedIncidentContext=async scope=>(await transact('readonly',s=>s.get(scope+':context')))?.value;
export const clearIncidentContext=scope=>transact('readwrite',s=>s.delete(scope+':context'));
// Always replay the same operation and evidence IDs. Never discard the local photos until all acknowledgements arrive.
export async function deliverIncident(entry,api,active=()=>true){
 if(!active())throw Error('session_changed');
 const result=await api(entry.operation);
 if(result?.ok!==true)throw Error('invalid_response');
 for(const photo of entry.photos){
  if(!active())throw Error('session_changed');
  if(!result.observation_id)throw Error('missing_observation');
  const saved=await api({action:'upload_photo',id:entry.operation.data.id,observation_id:result.observation_id,evidence_id:photo.id,photo});
  if(saved?.ok!==true)throw Error('invalid_response');
 }
 if(!active())throw Error('session_changed');
 await removeIncidentEntry(entry);
 return result;
}

// Sign-out removes catalog caches, but must not silently erase unsent evidence.
export async function retainPendingIncidentsOnLogout(){
 const rows=await transact('readonly',s=>s.getAll());
 await transact('readwrite',s=>{for(const row of rows)if(row.kind!=='queue')s.delete(row.key);});
 return rows.some(row=>row.kind==='queue');
}
