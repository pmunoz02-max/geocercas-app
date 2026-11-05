import {it,expect,vi} from 'vitest';
import {filterIncidentReport,incidentCsv,loadIncidentReport} from '../lib/incidentReport';
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
