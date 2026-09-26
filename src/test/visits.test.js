import {describe,it,expect,vi} from 'vitest';
import {normalizeVisit,identifyVisitActor} from '../../server/api-lib/visits.js';
import {csvCell} from '../lib/visitDrafts';
const id='11111111-1111-4111-8111-111111111111';
const base={id,geofence_id:id,started_at:'2026-09-25T12:00:00Z',purpose:'Inspección'};
describe('visit evidence',()=>{
 it('allows missing location without inventing verification',()=>{expect(normalizeVisit(base).data.document.start_location).toBeNull();});
 it.each([{lat:91,lng:0,accuracy:1,captured_at:'2026-09-25'}, {lat:0,lng:0,accuracy:-1,captured_at:'2026-09-25'}])('rejects invalid coordinates',point=>{expect(()=>normalizeVisit({...base,start_location:point})).toThrow('invalid_location');});
 it('retains photo location as attachment evidence, not verified camera location',()=>{
 const location={lat:1,lng:2,accuracy:4,captured_at:'2026-09-25T12:00:00Z'};
 const r=normalizeVisit({...base,photo:{type:'image/png',base64:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64'),attached_at:location.captured_at,location}});
 expect(r.data.document.photo.location).toMatchObject(location);
 expect(r.data.document.photo.source).toBe('attachment_location_not_verified_capture');
 });
 it('rejects a script disguised as an image',()=>expect(()=>normalizeVisit({...base,photo:{type:'image/png',base64:Buffer.from('<script>').toString('base64')}})).toThrow('invalid_photo'));
 it('prevents spreadsheet formula injection',()=>expect(csvCell('=HYPERLINK("bad")')).toMatch(/^"'/));
});
function dbFor(session,role='tracker') {const db={from:vi.fn(table=>{const q={select:()=>q,eq:()=>q,is:()=>q,maybeSingle:async()=>({data:table==='memberships'?{role}:session})};return q;})};return db;}
it('rejects runtime tokens for another organization',async()=>{expect(await identifyVisitActor(dbFor({org_id:'other',expires_at:'2099-01-01'}),'token',id,true)).toBeNull();});
it('rejects expired or revoked runtime sessions',async()=>{for(const s of [{expires_at:'2020-01-01'},{expires_at:'2099-01-01',revoked_at:'2026-01-01'}])expect(await identifyVisitActor(dbFor({org_id:id,...s}),'token',id,true)).toBeNull();});
it('runtime sessions never acquire administrative privileges',async()=>{expect(await identifyVisitActor(dbFor({org_id:id,tracker_user_id:id,expires_at:'2099-01-01'},'owner'),'token',id,true)).toBeNull();});

const png={type:'image/png',base64:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64'),attached_at:'2026-09-25T12:00:00Z',location:null};
it('accepts five photos and rejects six on the server',()=>{
 expect(normalizeVisit({...base,photos:Array(5).fill(png)}).data.document.photos).toHaveLength(5);
 expect(()=>normalizeVisit({...base,photos:Array(6).fill(png)})).toThrow('photo_limit');
});
it('accepts combined size above 2 MB when each photo is within 2 MB',()=>{
 const bytes=Buffer.alloc(1100000);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
 expect(normalizeVisit({...base,photos:Array(5).fill({...png,base64:bytes.toString('base64')})}).data.document.photos).toHaveLength(5);
});
it('only accepts photo references belonging to this visit',()=>{
 const saved=normalizeVisit({...base,photos:[png]}).data.document;
 expect(normalizeVisit({...base,photos:[{hash:saved.photos[0].hash}]},saved).data.document.photos).toEqual(saved.photos);
 expect(()=>normalizeVisit({...base,photos:[{hash:'other'}]},saved)).toThrow('invalid_photo');
});
it('preserves legacy photo and supports explicit removal',()=>{
 const saved=normalizeVisit({...base,photo:png}).data.document;
 expect(normalizeVisit(base,saved).data.document).toEqual(saved);
 expect(normalizeVisit({...base,photos:[]},saved).data.document.photos).toEqual([]);
});
it('retrying the same images preserves saved metadata',()=>{
 const saved=normalizeVisit({...base,photos:[png]}).data.document;
 expect(normalizeVisit({...base,photos:[{...png,attached_at:'2026-09-26T12:00:00Z'}]},saved).data.document).toEqual(saved);
});
