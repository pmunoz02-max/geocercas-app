import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
const org="org-A",user="user-A";
let handler,fetchMock;
beforeEach(async()=>{
 vi.resetModules();vi.stubEnv("SUPABASE_URL","https://preview-test.invalid");vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","test-only");
 fetchMock=vi.fn(async(url,options={})=>{
  if(options.method==="PATCH")return {ok:true};
  if(url.includes("tracker_runtime_sessions?"))return {ok:true,json:async()=>[{id:"session",org_id:org,tracker_user_id:user,expires_at:new Date(Date.now()+60000).toISOString()}]};
  if(url.includes("memberships?"))return {ok:true,json:async()=>[{user_id:user}]};
  if(url.includes("personal?")||url.includes("asignaciones?"))return {ok:true,json:async()=>[]};
  throw Error("unexpected persistence or lookup: "+url);
 });vi.stubGlobal("fetch",fetchMock);handler=(await import("../../api/send-position.js")).default;
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
async function call(body){const res={status:vi.fn(function(code){this.code=code;return this}),json:vi.fn(function(data){this.data=data;return this})};await handler({method:"POST",headers:{authorization:"Bearer test-runtime"},body:{lat:-0.07,lng:-78.46,...body}},res);return res;}
describe("queued point identity isolation",()=>{
 it("rejects points from another organization before assignment/position access",async()=>{const r=await call({org_id:"org-B",user_id:user});expect(r.code).toBe(409);expect(r.data.error).toBe("session_identity_mismatch");expect(fetchMock).toHaveBeenCalledTimes(3);});
 it("rejects a different tracker under a valid credential",async()=>{const r=await call({org_id:org,user_id:"user-B"});expect(r.code).toBe(409);expect(fetchMock).toHaveBeenCalledTimes(3);});
 it("preserves the assigned-geofence gate for matching identity",async()=>{const r=await call({org_id:org,user_id:user});expect(r.code).toBe(200);expect(r.data).toEqual({ok:true,stored:false,reason:"no_active_geofence_assignment"});});
});
