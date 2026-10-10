import test from 'node:test';
import assert from 'node:assert/strict';
import {handleInsights} from '../lib/ai.ts';
const evidence={
  currency:'USD',period:{start:'2026-10-01',end:'2026-10-10',days:10,comparisonAvailable:true,previousStart:'2026-09-21',previousEnd:'2026-09-30'},
  totalCents:10000,previousCents:20000,changePercent:-50,averageDailyCents:1000,
  products:[{name:'Tee',revenueCents:10000,previousCents:20000,changePercent:-50,sharePercent:100}],
  anomalies:[],missingDays:0,rejectedRows:0,isSyntheticDemo:true
};
const request=(body:unknown)=>new Request('https://example.com/api/insights',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://example.com'},body:JSON.stringify(body)});
test('unconfigured AI is explicit and makes no provider call',async()=>{
  const r=await handleInsights(request({evidence}),{},async()=>{throw new Error('Should not call provider');});
  assert.equal(r.status,503);
  const status=await handleInsights(new Request('https://example.com/api/insights'),{});
  assert.deepEqual(await status.json(),{configured:false});
});
test('invalid aggregates and foreign origins are rejected before upstream calls',async()=>{
  const r=await handleInsights(request({evidence:{...evidence,totalCents:-1}}),{OPENAI_API_KEY:'test-only'});
  assert.equal(r.status,400);
  const cross=new Request('https://example.com/api/insights',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});
  assert.equal((await handleInsights(cross,{OPENAI_API_KEY:'test-only'})).status,403);
});
test('oversized aggregate body is rejected',async()=>{
  const r=await handleInsights(request({evidence,padding:'x'.repeat(140000)}),{OPENAI_API_KEY:'test-only'});
  assert.equal(r.status,413);
});
test('Responses payload has server-only authorization, no stored response, and extracts text',async()=>{
  let called=false;
  const mock:typeof fetch=async(url,init)=>{
    called=true;assert.equal(url,'https://api.openai.com/v1/responses');
    assert.equal((init!.headers as Record<string,string>).Authorization,'Bearer test-only');
    const body=JSON.parse(String(init!.body));
    assert.equal(body.store,false);assert.equal(body.model,'gpt-4.1-mini');
    assert.deepEqual(JSON.parse(body.input),evidence);
    assert.ok(body.instructions.includes('not causal proof'));
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Synthetic demo. Revenue declined 50%.'}]}]});
  };
  const r=await handleInsights(request({evidence}),{OPENAI_API_KEY:'test-only'},mock);
  assert.equal(r.status,200);assert.equal(called,true);
  assert.equal(((await r.json()) as {text:string}).text,'Synthetic demo. Revenue declined 50%.');
});
test('provider errors do not leak credentials or upstream response bodies',async()=>{
  for(const status of [401,429,500]) {
    const r=await handleInsights(request({evidence}),{OPENAI_API_KEY:'test-only'},async()=>new Response('sensitive upstream details',{status}));
    assert.equal(r.status,status===429?429:502);
    const body=await r.text();assert.ok(!body.includes('test-only'));assert.ok(!body.includes('sensitive'));
  }
});
test('incomplete or empty model responses are not shown as successful briefs',async()=>{
  for(const body of [{status:'incomplete',output:[]},{status:'completed',output:[]}]) {
    const r=await handleInsights(request({evidence}),{OPENAI_API_KEY:'test-only'},async()=>Response.json(body));
    assert.equal(r.status,502);
  }
});
