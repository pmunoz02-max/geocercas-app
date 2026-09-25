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
