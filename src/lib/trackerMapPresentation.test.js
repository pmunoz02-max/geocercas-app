import {describe,it,expect} from 'vitest';
import {filterTrackerRows,validTrackerCoordinates,chooseTrackerLabels,TRACKER_STATUS_COLORS} from './trackerMapPresentation';
const rows=[{tracker_key:'a',display_name:'Pietro Muñoz',email:'pietro@example.com',live:{status:'online'}},{tracker_key:'b',name:'Ana',live:{status:'offline'}},{tracker_key:'c',name:'Luis',live:{status:'stale'}}];
describe('shared dashboard filters',()=>{
 it('combines selection, status and accent-insensitive search',()=>{expect(filterTrackerRows(rows,{selectedTrackerId:'a',statusFilter:'online',search:'munoz'})).toEqual([rows[0]]);expect(filterTrackerRows(rows,{selectedTrackerId:'a',statusFilter:'offline'})).toEqual([]);});
 it('searches names and emails and excludes hidden trackers',()=>{expect(filterTrackerRows(rows,{search:'pietro@example'})).toEqual([rows[0]]);expect(filterTrackerRows(rows,{statusFilter:'stale'})).toEqual([rows[2]]);expect(filterTrackerRows(rows,{search:'missing'})).toEqual([]);});
 it('retains all rows with default filters',()=>expect(filterTrackerRows(rows)).toEqual(rows));
});
describe('GPS coordinates',()=>{
 it.each([null,undefined,'',' ',false,NaN])('rejects missing or invalid coordinate %s',v=>expect(validTrackerCoordinates(v,0)).toBe(false));
 it('accepts real zero and numeric strings within limits',()=>{expect(validTrackerCoordinates(0,0)).toBe(true);expect(validTrackerCoordinates('-0.07','-78.4')).toBe(true);expect(validTrackerCoordinates(91,0)).toBe(false);expect(validTrackerCoordinates(0,181)).toBe(false);});
});
describe('persistent names',()=>{
 const project=([x,y])=>({x,y}),size={x:800,y:600},name=()=> 'Pietro';
 it('suppresses overlapping labels',()=>{expect(chooseTrackerLabels([{key:'a',lat:100,lng:100},{key:'b',lat:100,lng:100}],project,size,name).size).toBe(1);});
 it('keeps separated labels and avoids covering other pins',()=>{expect(chooseTrackerLabels([{key:'a',lat:100,lng:100},{key:'b',lat:400,lng:300}],project,size,name).size).toBe(2);expect(chooseTrackerLabels([{key:'a',lat:100,lng:100},{key:'b',lat:150,lng:100}],project,size,name).has('a')).toBe(false);});
 it('hides dense-fleet and clipped labels',()=>{expect(chooseTrackerLabels(Array.from({length:13},(_,i)=>({key:String(i),lat:100,lng:100})),project,size,name).size).toBe(0);expect(chooseTrackerLabels([{key:'a',lat:790,lng:100}],project,size,name).size).toBe(0);});
 it('uses distinct online, stale and offline colors',()=>expect(new Set(Object.values(TRACKER_STATUS_COLORS)).size).toBe(3));
});

import {visibleRoutePositions} from './trackerMapPresentation';
it('keeps complete valid trajectories only for filtered trackers',()=>{
 const positions=[{user_id:'a',lat:0,lng:0},{user_id:'b',lat:1,lng:1},{user_id:'a',lat:2,lng:2},{user_id:'a',lat:null,lng:0}];
 const visible=filterTrackerRows(rows,{statusFilter:'online'});
 expect(visibleRoutePositions(positions,new Set(visible.map(row=>row.tracker_key)),p=>p.user_id)).toEqual([positions[0],positions[2]]);
 expect(visibleRoutePositions(positions,new Set(),p=>p.user_id)).toEqual([]);
});
