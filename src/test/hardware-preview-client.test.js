import { describe, it, expect, vi } from 'vitest';
import { createPreviewHardwareClient } from '../../lib/hardware/preview-client.mjs';
const url='https://mujwsfhkocsuuahlrssn.supabase.co';
const config={url,serviceKey:'fictional-test-service-key',enabled:'true'};
describe('hardware backend Preview boundary',()=>{
 it.each(['https://wpaixkvokdkudymgjoua.supabase.co',url+'/','https://example.com',undefined])('rejects other target %s',target=>expect(()=>createPreviewHardwareClient({...config,url:target})).toThrow('hardware_preview_configuration_required'));
 it('requires explicit enable and credential',()=>{
  expect(()=>createPreviewHardwareClient({...config,enabled:'false'})).toThrow();
  expect(()=>createPreviewHardwareClient({...config,serviceKey:''})).toThrow();
 });
 it('sends backend auth only to exact Preview RPC and refuses redirects',async()=>{
  const fetchImpl=vi.fn().mockResolvedValue({ok:true,json:async()=>({status:'stored'})});
  const rpc=createPreviewHardwareClient({...config,fetchImpl});
  const args={p_device_id:'fixture',p_observation:{event_id:'unchanged'}};
  expect(await rpc('ingest_hardware_observation_preview',args)).toEqual({status:'stored'});
  expect(fetchImpl).toHaveBeenCalledWith(url+'/rest/v1/rpc/ingest_hardware_observation_preview',expect.objectContaining({redirect:'error',body:JSON.stringify(args)}));
  await expect(rpc('arbitrary_function',{})).rejects.toThrow('hardware_rpc_not_allowed');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
 });
 it('does not print server responses or transport secrets',async()=>{
  const rpc=createPreviewHardwareClient({...config,fetchImpl:vi.fn().mockRejectedValue(new Error(config.serviceKey))});
  await expect(rpc('ingest_hardware_observation_preview',{})).rejects.toThrow('hardware_transport_failed_retry_same_event');
  const denied=createPreviewHardwareClient({...config,fetchImpl:vi.fn().mockResolvedValue({ok:false,status:403})});
  await expect(denied('ingest_hardware_observation_preview',{})).rejects.toThrow('hardware_rpc_http_403');
 });
});
