import {it,expect,vi} from 'vitest';
import {incidentTransport} from '../lib/incidentTransport';
it('uses the native fixed-endpoint bridge without passing a credential',async()=>{
 window.AndroidBridge={incidentRequest:vi.fn((id,raw)=>{const request=JSON.parse(raw);expect(request.org_id).toBe('org');expect(request.user_id).toBe('user');expect(request.query.id).toBe('record');expect(raw).not.toContain('credential');window.dispatchEvent(new CustomEvent('geofield-incidents-response',{detail:{id,status:200,body:'{"ok":true}'}}));})};
 const response=await incidentTransport('org','user',{runtimeToken:'credential'})('/api/incidents?id=record');expect(await response.json()).toEqual({ok:true});delete window.AndroidBridge;
});
it('requires updated Android instead of falling back to web credentials',async()=>{await expect(incidentTransport('org','user',{})('/api/incidents')).rejects.toMatchObject({status:426});});
it('sends incidents through the production origin-bound channel',async()=>{
 const postMessage=vi.fn(raw=>{
  const {id,payload}=JSON.parse(raw);
  expect(JSON.parse(payload).org_id).toBe('org');
  expect(raw).not.toContain('credential');
  window.dispatchEvent(new CustomEvent('geofield-incidents-response',{detail:{id,status:200,body:'{"ok":true}'}}));
 });
 window.GeoFieldIncidents={postMessage};
 try {
  const response=await incidentTransport('org','user',{runtimeToken:'credential'})('/api/incidents');
  expect(await response.json()).toEqual({ok:true});
  expect(postMessage).toHaveBeenCalledTimes(1);
 } finally {delete window.GeoFieldIncidents;}
});
