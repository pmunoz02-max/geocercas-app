import {describe,it,expect} from "vitest";
import {summarizeTrackerRows} from "./trackerRowSummary";
describe("dashboard table counts",()=>{
 it("counts a visible offline tracker even without health RPC rows or coordinates",()=>{
  expect(summarizeTrackerRows([{user_id:"tracker",live:{status:"offline"}}])).toEqual({total:1,online:0,stale:0,offline:1});
 });
 it("keeps all table statuses in one consistent summary",()=>{
  expect(summarizeTrackerRows([{live:{status:"online"}},{live:{status:"stale"}},{live:{status:"offline"}},{}])).toEqual({total:4,online:1,stale:1,offline:2});
 });
});
