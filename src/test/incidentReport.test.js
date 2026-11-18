import {it,expect,vi} from 'vitest';
import {filterIncidentReport,incidentCsv,incidentObservationSeries,loadIncidentReport} from '../lib/incidentReport';

it('counts observations by local calendar day and fills missing days',()=>{
 const row=(day,hour)=>({observed_at:new Date(2026,10,day,hour).toISOString()});
 expect(incidentObservationSeries([row(5,1),row(3,8),row(3,23)])).toEqual({
  unit:'day',
  points:[{date:Date.UTC(2026,10,3),count:2},{date:Date.UTC(2026,10,4),count:0},{date:Date.UTC(2026,10,5),count:1}],
 });
 expect(incidentObservationSeries([]).points).toEqual([]);
});

it('groups distant observations by month or year',()=>{
 const row=(year,month)=>({observed_at:new Date(year,month,15,12).toISOString()});
 const first=row(2023,10);
 expect(incidentObservationSeries([first,row(2024,0)]).points.map(({count})=>count)).toEqual([1,0,1]);
 expect(incidentObservationSeries([first,row(2026,10)])).toEqual({
  unit:'year',
  points:[{date:Date.UTC(2023,0),count:1},{date:Date.UTC(2024,0),count:0},{date:Date.UTC(2025,0),count:0},{date:Date.UTC(2026,0),count:1}],
 });
});
it('loads every cursor page and fails closed on an identity change',async()=>{
 const first={id:'1',title:'A'},second={id:'2',title:'B'};
 const request=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({user_id:'u',items:[first],next:{before:'time',before_id:'1'}})}).mockResolvedValueOnce({ok:true,json:async()=>({user_id:'u',items:[second],next:null})});
 expect(await loadIncidentReport(request,'o','u',new AbortController().signal)).toEqual([first,second]);
 expect(request.mock.calls[1][0]).toContain('before_id=1');
 request.mockResolvedValue({ok:true,json:async()=>({user_id:'other',items:[first]})});
 await expect(loadIncidentReport(request,'o','u',new AbortController().signal)).rejects.toThrow('report_failed');
});
it('combines date, archived plot and classifications without dropping end-day records',()=>{
 const row={title:'Plaga',observed_at:new Date(2026,10,5,23,59).toISOString(),geofence_id:'archived',author_id:'u',category:'pest',severity:'high',status:'detected'};
 expect(filterIncidentReport([row],{from:'2026-11-05',to:'2026-11-05',geofence_id:'archived',search:'plaga',status:'detected'})).toEqual([row]);
 expect(filterIncidentReport([row],{status:'closed'})).toEqual([]);
});
it('escapes spreadsheet formulas, multiline text and quotes',()=>{
 const csv=incidentCsv([['=HYPERLINK("bad")','a,b','line\nbreak',' normal']]);
 expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
 expect(csv).toContain('"a,b"');
 expect(csv).toContain('"line\nbreak"');
});
it('refuses repeated pagination instead of producing a partial export',async()=>{
 const request=async()=>({ok:true,json:async()=>({user_id:'u',items:[],next:{before:'t',before_id:'id'}})});
 await expect(loadIncidentReport(request,'o','u',new AbortController().signal)).rejects.toThrow('invalid_cursor');
});
