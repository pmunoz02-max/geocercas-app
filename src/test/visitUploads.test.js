import {it,expect,vi} from 'vitest';
import {saveVisitWithPhotos} from '../lib/visitUploads';
import {photoReceipt,readPhotoReceipt,normalizeVisit} from '../../server/api-lib/visits';
it('sends five 2 MB images individually and closes only after all uploads',async()=>{
 const bytes=Buffer.alloc(2097152);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
 const photos=Array.from({length:5},()=>({base64:bytes.toString('base64'),type:'image/png',attached_at:'2026-09-26T12:00:00Z'}));
 const request=vi.fn(async body=>body.action==='upload_photo'?{receipt:'signed'}:{ok:true});
 await saveVisitWithPhotos({id:'visit',photos,ended_at:'2026-09-26T12:00:00Z'},request);
 expect(request).toHaveBeenCalledTimes(6);
 for(const [body] of request.mock.calls.slice(0,5)){expect(body.photos).toBeUndefined();expect(body.action).toBe('upload_photo');expect(JSON.stringify(body).length).toBeLessThan(3000000);}
 const final=request.mock.calls[5][0];expect(final.photos).toHaveLength(5);expect(final.photo).toBeUndefined();expect(final.ended_at).toBeTruthy();
});
it('does not save or close the visit after an upload failure',async()=>{
 const request=vi.fn().mockResolvedValueOnce({receipt:'one'}).mockRejectedValueOnce(new Error('offline'));
 await expect(saveVisitWithPhotos({photos:[{base64:'one'},{base64:'two'}]},request)).rejects.toThrow('offline');
 expect(request).toHaveBeenCalledTimes(2);
});
it('receipts are scoped and cannot be forged',()=>{
 const receipt=photoReceipt({hash:'h'},'org:user:visit','secret');
 expect(readPhotoReceipt(receipt,'org:user:visit','secret')).toEqual({hash:'h'});
 expect(()=>readPhotoReceipt(receipt,'other:user:visit','secret')).toThrow('invalid_photo');
 expect(()=>readPhotoReceipt(receipt,'org:user:visit','wrong')).toThrow('invalid_photo');
});
it('rejects a single photo above 2 MB',()=>{
 const id='11111111-1111-4111-8111-111111111111';
 expect(()=>normalizeVisit({id,geofence_id:id,purpose:'test',photos:[{base64:Buffer.alloc(2097153).toString('base64'),type:'image/png',attached_at:'2026-09-26'}]})).toThrow('invalid_photo');
});
