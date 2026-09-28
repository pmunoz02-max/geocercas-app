import {it,expect} from 'vitest';
import {hardwareHealth} from '../lib/hardwarePreview';
const now=Date.parse('2026-09-28T12:00:00Z');
const row=(receiveAge,recordAge,fix=true)=>({received_at:new Date(now-receiveAge*1000).toISOString(),recorded_at:new Date(now-recordAge*1000).toISOString(),fix_valid:fix});
it('distinguishes online, missing fix, delayed and lost communication',()=>{
 expect(hardwareHealth(row(10,10),now).code).toBe('online');
 expect(hardwareHealth(row(10,10,false),now).code).toBe('no_fix');
 expect(hardwareHealth(row(10,600),now).code).toBe('delayed');
 expect(hardwareHealth(row(181,181,false),now).code).toBe('offline');
 expect(hardwareHealth(null,now).code).toBe('empty');
});
it('does not refresh an old receipt on retry and handles threshold',()=>{
 expect(hardwareHealth(row(180,180),now).code).toBe('online');
 expect(hardwareHealth(row(180,180),now+1).code).toBe('offline');
 expect(hardwareHealth(row(181,181),now).code).toBe('offline');
});
it('rejects invalid timestamps and excessive future clocks',()=>{
 expect(hardwareHealth(row(-121,0),now).code).toBe('unknown');
 expect(hardwareHealth({received_at:'bad'},now).code).toBe('unknown');
});
