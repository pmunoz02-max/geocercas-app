import 'fake-indexeddb/auto';
import {it,expect,vi} from 'vitest';
import {enqueueIncident,incidentQueue,deliverIncident,cacheIncidentContext,cachedIncidentContext,retainPendingIncidentsOnLogout} from '../lib/incidentQueue';
it('persists photos and scopes records to organization and user',async()=>{
 const scope=crypto.randomUUID();const operation={operation_id:crypto.randomUUID(),action:'create',data:{id:crypto.randomUUID()}};
 await enqueueIncident(scope,operation,[{id:crypto.randomUUID(),base64:'photo'}]);
 expect((await incidentQueue(scope))[0].photos[0].base64).toBe('photo');expect(await incidentQueue(scope+'other')).toEqual([]);
 await cacheIncidentContext(scope,{user_id:'u',items:[{private:'x'}],enabled:true});expect((await cachedIncidentContext(scope)).items).toEqual([]);expect(await cachedIncidentContext(scope+'other')).toBeUndefined();
});
it('replays identical IDs after partial upload and only removes acknowledged data',async()=>{
 const scope=crypto.randomUUID(),operation={operation_id:crypto.randomUUID(),action:'create',data:{id:crypto.randomUUID()}};
 const entry=await enqueueIncident(scope,operation,[{id:crypto.randomUUID(),base64:'one'},{id:crypto.randomUUID(),base64:'two'}]);
 let fail=true;const api=vi.fn(async body=>{if(body.photo?.base64==='two'&&fail)throw Error('network');return {ok:true,observation_id:'obs'};});
 await expect(deliverIncident(entry,api)).rejects.toThrow('network');expect(await incidentQueue(scope)).toHaveLength(1);
 fail=false;await deliverIncident((await incidentQueue(scope))[0],api);expect(await incidentQueue(scope)).toEqual([]);
 expect(api.mock.calls[0][0]).toEqual(api.mock.calls[3][0]);expect(api.mock.calls[1][0].evidence_id).toBe(api.mock.calls[4][0].evidence_id);
});
it('stops a queued upload on identity change and keeps evidence',async()=>{
 const scope=crypto.randomUUID();const entry=await enqueueIncident(scope,{operation_id:crypto.randomUUID(),data:{id:'x'}},[{id:'p'}]);let active=true;
 const api=vi.fn(async()=>{active=false;return {ok:true,observation_id:'obs'};});await expect(deliverIncident(entry,api,()=>active)).rejects.toThrow('session_changed');expect(api).toHaveBeenCalledTimes(1);expect(await incidentQueue(scope)).toHaveLength(1);
});

it('sign-out retains unsent evidence while discarding cached authorization context',async()=>{
 const scope=crypto.randomUUID();await enqueueIncident(scope,{operation_id:crypto.randomUUID(),data:{id:'x'}},[{id:'p',base64:'saved'}]);await cacheIncidentContext(scope,{enabled:true});
 expect(await retainPendingIncidentsOnLogout()).toBe(true);expect(await cachedIncidentContext(scope)).toBeUndefined();expect((await incidentQueue(scope))[0].photos[0].base64).toBe('saved');
});
