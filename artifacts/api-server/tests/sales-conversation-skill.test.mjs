import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const dir = await mkdtemp(join(tmpdir(), "sales-skill-"));
await build({entryPoints:["src/lib/salesConversationSkill.ts"],bundle:true,platform:"node",format:"esm",outfile:join(dir,"skill.mjs")});
await build({entryPoints:["src/lib/commercialSales.ts"],bundle:true,platform:"node",format:"esm",outfile:join(dir,"memory.mjs")});
const {planSalesConversation, generatePlannedConversation} = await import(pathToFileURL(join(dir,"skill.mjs")));
const {updateCommercialMemory} = await import(pathToFileURL(join(dir,"memory.mjs")));
test.after(()=>rm(dir,{recursive:true,force:true}));
const initial = () => ({revision:0,interests:[],criteria:[],constraints:[],answeredQuestions:[],objections:[],stage:"welcome",missingData:[],humanControl:"ai"});
const strategy = {availableActions:["catalog","checkout","owner_handoff","visit_request"],essentialQuestions:[],objective:"purchase"};
const base = (memory,message,extra={})=>({memory,message,strategy,contactStatus:"declined",offerings:["Produto A"],hasCatalog:true,hasWhatsApp:true,paid:false,pending:false,...extra});
test("multi-turn interest, missing media and confirmed request never become a sale", async()=>{
  let memory = initial();
  for (const [message,extra,action] of [
    ["Interessante",{},"qualify_need"],
    ["Tem mais imagens?",{resourceRequested:true},"ask_question"],
    ["Sim",{requestRegistered:true},"handoff_to_human"],
  ]) {
    memory = updateCommercialMemory(memory,message,["Produto A"]);
    const plan=planSalesConversation(base(memory,message,extra));
    assert.equal(plan.decision.action,action);
    assert.notEqual(plan.decision.interest,"qualified");
    const rendered=await generatePlannedConversation(plan,async instructions=>{
      assert.ok(instructions.includes(action));return {reply:"Resposta contextual"};
    },()=>({reply:"Erro explícito"}));
    assert.equal(rendered.failed,false);
    memory.salesDecision=plan.decision;
    memory=JSON.parse(JSON.stringify(memory)); // durable reload
  }
  assert.equal(memory.salesDecision.outcome,"request_registered");
});
test("provider outage does not change the validated checkout or register another action",async()=>{
  const message="Não quero continuar no WhatsApp, mas quero comprar Produto A";
  const memory=updateCommercialMemory(initial(),message,["Produto A"]);
  const plan=planSalesConversation(base(memory,message));
  assert.equal(plan.nextAction.type,"checkout");
  const before=JSON.stringify(plan);
  const rendered=await generatePlannedConversation(plan,async()=>{throw Error("provider down")},()=>({reply:"Usa a opção abaixo."}));
  assert.equal(rendered.failed,true);
  assert.equal(JSON.stringify(plan),before);
});
test("interpretation citations are grounded; explicit purchase defeats model research",()=>{
  const message="Quero comprar Produto A";
  const memory=updateCommercialMemory(initial(),message,["Produto A"]);
  const plan=planSalesConversation(base(memory,message,{interpretation:{intent:"research",need:"inventada",urgency:"hoje",objection:null,evidence:["inventada",message]}}));
  assert.equal(plan.decision.intent,"purchase");
  assert.equal(plan.decision.need,null);
  assert.equal(plan.decision.urgency,null);
  assert.deepEqual(plan.decision.evidence,[message]);
});
test("price/trust objections are interpreted without authorizing discounts",()=>{
  const message="Não confio neste serviço";
  const plan=planSalesConversation(base(initial(),message,{interpretation:{intent:"objection",objection:"trust",need:null,urgency:null,evidence:[message]}}));
  assert.equal(plan.decision.action,"handle_objection");
  assert.equal(plan.nextAction.type,"none");
});
test("paid authority is separate from user assertion and booking CTA",()=>{
  for(const paid of [false,true]) {
    const message="Já paguei";
    const plan=planSalesConversation(base(updateCommercialMemory(initial(),message,[]),message,{paid}));
    assert.equal(plan.decision.outcome,paid?"payment_confirmed":"response_planned");
  }
  const message="Quero visitar";
  const plan=planSalesConversation(base(updateCommercialMemory(initial(),message,[]),message));
  assert.equal(plan.decision.action,"propose_visit");
  assert.equal(plan.decision.outcome,"response_planned");
});