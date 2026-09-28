import {describe,it,expect} from 'vitest';
import {hardwarePreviewAllowed,routePoints} from '../lib/hardwarePreview';
describe('hardware preview route',()=>{
 it('blocks production host and production database independently',()=>{
 expect(hardwarePreviewAllowed('app.tugeocercas.com','https://mujwsfhkocsuuahlrssn.supabase.co')).toBe(false);
 expect(hardwarePreviewAllowed('preview.tugeocercas.com','https://wpaixkvokdkudymgjoua.supabase.co')).toBe(false);
 expect(hardwarePreviewAllowed('preview.tugeocercas.com','https://mujwsfhkocsuuahlrssn.supabase.co')).toBe(true);
 });
 it('filters missing fix and preserves zero coordinates',()=>{
 expect(routePoints([{fix_valid:false,latitude:0,longitude:0},{fix_valid:true,latitude:91,longitude:0},{fix_valid:true,latitude:0,longitude:0,event_id:'a',recorded_at:'2026-01-01'}])).toHaveLength(1);
 });
 it('matches database ASCII order and does not mutate response',()=>{
 const rows=['a','Z','A'].map(event_id=>({fix_valid:true,latitude:0,longitude:0,recorded_at:'2026-01-01',event_id}));
 expect(routePoints(rows).map(p=>p.event_id)).toEqual(['A','Z','a']);
 expect(rows[0].event_id).toBe('a');
 });
});
