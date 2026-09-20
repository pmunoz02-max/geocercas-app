import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
const root=fileURLToPath(new URL("..", import.meta.url));
const env={PADDLE_ENV:'sandbox',PADDLE_API_KEY_SANDBOX:'sandbox-test-only',PADDLE_PRO_PRICE_ID_SANDBOX:'pri_test_pro',PADDLE_ENTERPRISE_PRICE_ID_SANDBOX:'pri_test_enterprise',PADDLE_ENTERPRISE_100_PRICE_ID_SANDBOX:'pri_test_enterprise100'};
function load(slug,overrides={}){
 let handler;
 const source=fs.readFileSync(`${root}/supabase/functions/${slug}/index.ts`,'utf8').replace(/^import .*;\r?\n/gm,'');
 const context=vm.createContext({console:{log(){},warn(){},error(){}},Deno:{env:{get:key=>env[key]}},serve:fn=>{handler=fn},Request,Response,Headers,URL,TextEncoder,crypto, ...overrides});
 vm.runInContext(stripTypeScriptTypes(source),context);
 return {context,handler,run:code=>vm.runInContext(code,context)};
}
const webhook=load('paddle-webhook');
assert.equal(webhook.run('resolvePlanByPriceId("pri_test_enterprise100")?.planCode'),'enterprise_100');
assert.equal(webhook.run('resolvePlanByPriceId("pri_test_enterprise")?.planCode'),'enterprise');
assert.equal(webhook.run('resolvePlanByPriceId("pri_test_pro")?.planCode'),'pro');
assert.equal(webhook.run('resolvePlanByPriceId("pri_unknown")'),null);
delete env.PADDLE_ENTERPRISE_100_PRICE_ID_SANDBOX;
assert.equal(webhook.run('resolvePlanByPriceId("pri_test_enterprise100")'),null);
const checkout=load('paddle-create-checkout');
assert.throws(()=>checkout.run('getPaddlePriceId("enterprise_100")'),/Missing Paddle ENTERPRISE_100/);
env.PADDLE_ENTERPRISE_100_PRICE_ID_SANDBOX='pri_test_enterprise100';
assert.equal(checkout.run('getPaddlePriceId("enterprise_100")'),'pri_test_enterprise100');
const reconcile=load('billing-reconcile');
assert.equal(reconcile.run('normalizePlanCode(" ENTERPRISE_100 ")'),'enterprise_100');
assert.equal(reconcile.run('toPlanCodeByPaddlePrice("pri_test_enterprise100")'),'enterprise_100');
assert.ok(reconcile.run('planRank("enterprise_100") > planRank("enterprise")'));
let row, calls=[];
const client={from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:row,error:null}}}}};
class HttpError extends Error {constructor(status,message){super(message);this.status=status}}
const change=load('paddle-change-plan',{
 HttpError,getAdminClient:()=>client,requireOrgAdmin:async req=>{if(!req.headers.has('authorization'))throw new HttpError(401,'unauthorized');return {user:{id:'test-admin'}}},
 fetch:async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return new Response(JSON.stringify({data:{id:'sub_test'}}),{status:200})}
});
const request=(plan,auth=true)=>new Request('https://preview.invalid/change',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer test'}:{})},body:JSON.stringify({org_id:'test-org',plan_code:plan})});
for(const current of ['pro','enterprise']){
 row={plan_code:current,subscribed_plan_code:current,plan_status:'active',billing_provider:'paddle',paddle_subscription_id:'sub_test',paddle_price_id:`pri_test_${current}`,cancel_at_period_end:false};
 const response=await change.handler(request('enterprise_100'));
 assert.equal(response.status,200);assert.equal((await response.json()).target_plan,'enterprise_100');
 assert.equal(calls.at(-1).body.items[0].price_id,'pri_test_enterprise100');
 assert.equal(calls.at(-1).body.on_payment_failure,'prevent_change');
}
const before=calls.length;
row={...row,plan_code:'enterprise_100',subscribed_plan_code:'enterprise_100'};
assert.equal((await change.handler(request('enterprise'))).status,409);
assert.equal((await change.handler(request('enterprise_100',false))).status,401);
assert.equal(calls.length,before);
row={...row,plan_code:'enterprise',subscribed_plan_code:'enterprise',cancel_at_period_end:true};
assert.equal((await change.handler(request('enterprise_100'))).status,409);
assert.equal(calls.length,before);
let billingLookupError=null;
const checkoutGuard=load('paddle-create-checkout',{
 HttpError,requireOrgAdmin:async()=>({user:{id:'admin'}}),getAdminClient:()=>({from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:row,error:billingLookupError}}}}}),
 fetch:async()=>{throw Error('Duplicate checkout must not reach Paddle');}
});
const checkoutRequest=()=>new Request('https://preview.invalid/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({org_id:'test-org',plan:'enterprise_100'})});
assert.equal((await checkoutGuard.handler(checkoutRequest())).status,409);
billingLookupError={message:'Database unavailable'};
assert.equal((await checkoutGuard.handler(checkoutRequest())).status,503);
env.SUPABASE_URL='https://preview.invalid';env.SUPABASE_SERVICE_ROLE_KEY='test-only';env.PADDLE_WEBHOOK_SECRET='test-only';
let payloadWritten=null;
const hookClient={async rpc(){return {data:{claimed:true},error:null}},from(){return {
 select(){return this},eq(){return this},async maybeSingle(){return {data:{tracker_limit_override:75,last_paddle_event_at:null},error:null}},
 async upsert(payload){payloadWritten=payload;return {error:null}}
}}};
const signedHook=load('paddle-webhook',{createClient:()=>hookClient});
const body=JSON.stringify({event_id:'evt_test_enterprise100',event_type:'transaction.completed',occurred_at:new Date().toISOString(),data:{id:'txn_test',subscription_id:'sub_test',customer_id:'ctm_test',custom_data:{org_id:'test-org'},items:[{price:{id:'pri_test_enterprise100'}}]}});
const ts=String(Math.floor(Date.now()/1000));
signedHook.context.signInput=ts+':'+body;
const signature=await signedHook.run('hmac("test-only",signInput)');
const hookResponse=await signedHook.handler(new Request('https://preview.invalid/webhook',{method:'POST',headers:{'paddle-signature':`ts=${ts};h1=${signature}`},body}));
assert.equal(hookResponse.status,200);
assert.equal(payloadWritten.plan_code,'enterprise_100');
assert.equal(payloadWritten.tracker_limit_override,75);
assert.equal('last_paddle_event_occurred_at' in payloadWritten,false);
assert.equal('last_paddle_event_id' in payloadWritten,false);
assert.equal((await signedHook.handler(new Request('https://preview.invalid/webhook',{method:'POST',body}))).status,401);
console.log('PASS: mappings, missing prices, rank, upgrades, auth, cancellation, duplicate checkout guard, signed webhook enterprise_100 payload, override preservation and unsigned rejection; no external payments.');
