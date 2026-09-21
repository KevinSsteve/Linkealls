import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

// Repository/provider substitutes; the actual chatWithLead orchestration,
// policy, grounding, selectors, memory and transaction boundary are bundled.
const dir=await mkdtemp(join(tmpdir(),"chat-pipeline-"));
const store={};
globalThis.__chatRepository=store;
const orm=`
const col=(t,k)=>({table:t,key:k});
export const tables={};
for(const t of ["leadsTable","ordersTable","salesOutcomeEventsTable","leadChatRequestsTable","resourceLibraryTable","resourceRequestsTable"])
 tables[t]=new Proxy({name:t},{get:(o,k)=>k==="name"?t:col(t,k)});
export const eq=(a,b)=>({op:"eq",a,b}), and=(...a)=>({op:"and",a}), or=(...a)=>({op:"or",a});
export const desc=a=>a,isNull=a=>({op:"eq",a,b:null}),lt=()=>({op:"true"}),lte=()=>({op:"true"}),gte=()=>({op:"true"});
export const sql=(s,...v)=>({sql:s.join("?"),v});
const state=()=>globalThis.__chatRepository;
function matches(c,row){
 if(!c)return true;
 if(c.op==="and")return c.a.filter(Boolean).every(x=>matches(x,row));
 if(c.op==="or")return c.a.some(x=>matches(x,row));
 if(c.op==="eq")return row[c.a.key]===c.b;
 if(c.sql?.includes("revision"))return String(row.commercialMemory.revision)===c.v.at(-1);
 if(c.sql?.includes("IN"))return ["open","fulfilled"].includes(row.status);
 return true;
}
function query(type,table,projection){
 let condition,values,limit;
 const q={from(t){table=t;return q},where(c){condition=c;return q},orderBy(){return q},limit(n){limit=n;return q},
 set(v){values=v;return q},values(v){values=v;return q},onConflictDoNothing(){return q},
 returning(p){projection=p;return q},catch(fn){return Promise.resolve(q).catch(fn)},
 async then(resolve,reject){try {
 if(type==="update" && values?.qualificationData && values?.commercialMemory && state().beforeQualificationUpdate) {
  const hook=state().beforeQualificationUpdate;delete state().beforeQualificationUpdate;await hook();
 }
 let rows=state().rows[table.name]??=[];
 if(type==="insert"){const row={id:"id-"+(++state().counter),status:"open",...values};rows.push(row);state().rows[table.name]=rows;resolve([row]);return;}
 const selected=rows.filter(row=>matches(condition,row)).slice(0,limit);
 if(type==="delete"){state().rows[table.name]=rows.filter(row=>!selected.includes(row));resolve([]);return;}
 if(type==="update")for(const row of selected)for(const [key,value] of Object.entries(values)){
  if(value?.sql && key==="commercialMemory" && value.sql.includes("jsonb_set"))row[key]={...row[key],revision:row[key].revision+1};
  else if(value?.sql && key==="chatMessages")row[key]=[...row[key],...JSON.parse(value.v.at(-1))];
  else if(value?.sql && key==="qualificationData"){const {phone,...rest}=row[key];row[key]=rest;}
  else row[key]=structuredClone(value);
 }
 resolve(selected.map(row=>projection?Object.fromEntries(Object.entries(projection).map(([key,value])=>[key,row[value.key]])):structuredClone(row)));
 }catch(e){reject(e)}}};
 return q;
}
export const db={select:p=>query("select",null,p),update:t=>query("update",t),insert:t=>query("insert",t),delete:t=>query("delete",t),
 execute:async()=>({rows:[]}),
 transaction:async fn=>{const snapshot=structuredClone(state().rows);try{return await fn(db)}catch(e){state().rows=snapshot;throw e}}};
export const {leadsTable,ordersTable,salesOutcomeEventsTable,leadChatRequestsTable,resourceLibraryTable,resourceRequestsTable}=tables;
`;
const modules={
 "@workspace/db":orm,
 "drizzle-orm":`export {eq,and,or,desc,isNull,lt,lte,gte,sql} from "@workspace/db";`,
 "@google/genai":`export class GoogleGenAI {models={generateContent:async()=>{const s=globalThis.__chatRepository;await s.onExtract?.();return {text:JSON.stringify(s.extraction)}}}}`,
 "openaiSales.js":`export const interpretSalesConversation=async()=>globalThis.__chatRepository.interpretation??null;
 export const generateSalesDecision=async(system,prompt)=>{const s=globalThis.__chatRepository;s.generatedSystem=system;s.generatedPrompt=prompt;await s.onGenerate?.();if(s.takeover){s.rows.leadsTable[0].commercialMemory.revision++;s.rows.leadsTable[0].commercialMemory.humanControl="owner";}if(s.fail)return null;return {decision:{reply:s.reply??"O que procuras nesta opção?",intent:"information",recommendedOfferings:[],nextQuestion:null,handoffReason:null,proposedAction:"none"},usage:{inputTokens:1,outputTokens:1,totalTokens:2}}};`,
 "businessBrain.js":`export const loadBusinessBrain=async()=>({profile:globalThis.__chatRepository.profile});export const renderBusinessBrain=()=>"";export const recordBusinessAiEvaluation=async()=>{};export const saveInteractionMemory=async()=>{};export const summarizeOldInteraction=()=>null;export const estimateGemini3FlashCostMicros=()=>0;`,
 "businessProfile.js":`export const getOrCreateProfile=async()=>globalThis.__chatRepository.profile;`,
 "notifications.js":`export const sendPushToOwner=async()=>{};`,
 "logger.js":`export const logger={info(...args){(globalThis.__chatRepository.successLogs??=[]).push(args)},warn(){},error(...args){(globalThis.__chatRepository.errorLogs??=[]).push(args)}};`,
 "salesStrategy.js":`export const ensureAutomaticStrategyVersion=async()=>{};export const deriveAutomaticStrategy=()=>globalThis.__chatRepository.strategy;export const resolveSalesStrategy=async()=>({strategy:null,override:null,sourceEligible:true});`,
};
await build({entryPoints:["src/services/leads.ts"],bundle:true,platform:"node",format:"esm",outfile:join(dir,"chat.mjs"),plugins:[{name:"repository",setup(b){
 b.onResolve({filter:/.*/},args=>{const key=args.path.startsWith(".")?args.path.split("/").at(-1):args.path;if(modules[key])return {path:key,namespace:"mock"}});
 b.onLoad({filter:/.*/,namespace:"mock"},args=>({contents:modules[args.path],loader:"js"}));
}}]});
const {chatWithLead,updateLeadState,processCallCompletion}=await import(pathToFileURL(join(dir,"chat.mjs")));
test.after(async()=>{delete globalThis.__chatRepository;await rm(dir,{recursive:true,force:true});});
function reset(){
 Object.keys(store).forEach(k=>delete store[k]);
 Object.assign(store,{counter:0,rows:{leadsTable:[{id:"lead",businessId:1,origin:{},chatMessages:[],qualificationData:{},contactConsentStatus:"pending",state:"novo",commercialMemory:{revision:0,interests:[],criteria:[],constraints:[],answeredQuestions:[],objections:[],stage:"welcome",missingData:[],humanControl:"ai"}}]},
 profile:{name:"Loja",catalogEnabled:true,offerings:[{name:"Produto A",price:"10.000 Kz",description:"A"},{name:"Produto B",price:"25.000 Kz",description:"B"}]},
 strategy:{availableActions:["catalog","checkout","owner_handoff","visit_request"],essentialQuestions:[],priorityOffers:[],verifiedDifferentials:[],objectionResponses:[],negotiationLimits:[],escalationRules:[],objective:"purchase"}});
}
test("full chat: remembered B -> contextual checkout B -> price with outage",async()=>{
 reset();
 await chatWithLead("lead","Quero saber o preço de Produto B",1);
 let response=await chatWithLead("lead","Quero comprar",1);
 assert.equal(response.nextAction.type,"checkout");
 assert.deepEqual(response.products.map(p=>p.name),["Produto B"]);
 store.fail=true;
 response=await chatWithLead("lead","Quanto custa esse?",1);
 assert.match(response.reply,/25.000 Kz/);
 assert.equal(store.rows.leadsTable[0].commercialMemory.salesDecision.intent,"price");
});
test("full chat: missing media confirmation persists atomically; replay cannot duplicate",async()=>{
 reset();
 await chatWithLead("lead","Tem mais imagens?",1);
 const response=await chatWithLead("lead","Sim",1,{requestId:"confirm"});
 assert.match(response.reply,/registado/);
 assert.equal(store.rows.resourceRequestsTable.length,1);
 await chatWithLead("lead","Sim",1,{requestId:"confirm"});
 assert.equal(store.rows.resourceRequestsTable.length,1);
});
test("owner takeover during generation prevents request creation",async()=>{
 reset();
 await chatWithLead("lead","Tem mais imagens?",1);
 store.takeover=true;
 await assert.rejects(chatWithLead("lead","Sim",1),/activa/);
 assert.equal(store.rows.resourceRequestsTable?.length??0,0);
 assert.equal(store.rows.leadsTable[0].commercialMemory.humanControl,"owner");
});
test("interest cannot qualify and an unrelated paid order cannot confirm current payment",async()=>{
 reset();
 await chatWithLead("lead","Interessante",1);
 assert.ok(store.rows.leadsTable[0].score<60);
 store.rows.ordersTable=[{id:"a",businessId:1,leadId:"lead",offeringName:"Produto A",status:"paga",fulfillmentStatus:"novo"},{id:"b",businessId:1,leadId:"lead",offeringName:"Produto B",status:"pendente",fulfillmentStatus:"novo"}];
 await chatWithLead("lead","Já paguei Produto B",1);
 assert.notEqual(store.rows.leadsTable[0].commercialMemory.salesDecision.outcome,"payment_confirmed");
});
test("full chat: approved upload linked to fulfilled request is delivered, unrelated tenant media is not",async()=>{
 reset();
 await chatWithLead("lead","Quero saber o preço de Produto B",1);
 await chatWithLead("lead","Tem mais imagens?",1);
 await chatWithLead("lead","Sim",1);
 const request=store.rows.resourceRequestsTable[0];
 request.status="fulfilled";
 store.rows.resourceLibraryTable=[
  {id:"right",businessId:1,kind:"image",purpose:`request:${request.id}`,title:"Galeria B",description:"B",url:"https://example.test/b.jpg",status:"approved",visibility:"public",validFrom:null,validUntil:null},
  {id:"wrong",businessId:2,kind:"image",purpose:`request:${request.id}`,title:"Outra",description:"",url:"https://example.test/private.jpg",status:"approved",visibility:"public",validFrom:null,validUntil:null},
  {id:"generic",businessId:1,kind:"image",purpose:"visitor_chat",title:"Galeria genérica",description:"",url:"https://example.test/generic.jpg",status:"approved",visibility:"public",validFrom:null,validUntil:null},
 ];
 const response=await chatWithLead("lead","Quero fotos de Produto B",1);
 assert.deepEqual(response.resources.map(r=>r.id),["right"]);
});
test("full chat: refusal preserves bound price, model comparison selects capability, refund never closes sale",async()=>{
 reset();
 store.rows.leadsTable[0].chatMessages.push({role:"bot",text:"Envia número",contactRequested:true,ts:new Date().toISOString()});
 store.reply="Produto B custa 10.000 Kz.";
 let response=await chatWithLead("lead","Agora não, mas quanto custa Produto B?",1);
 assert.match(response.reply,/25.000 Kz/);
 assert.doesNotMatch(response.reply,/10.000 Kz/);
 store.interpretation={intent:"compare",need:null,urgency:null,objection:null,evidence:["Qual dos dois compensa?"]};
 response=await chatWithLead("lead","Qual dos dois compensa?",1);
 assert.equal(response.nextAction.type,"catalog");
 store.rows.ordersTable=[{id:"a",businessId:1,leadId:"lead",offeringName:"Produto A",status:"paga",fulfillmentStatus:"novo"}];
 await chatWithLead("lead","Quero reembolso de Produto A",1);
 assert.notEqual(store.rows.leadsTable[0].commercialMemory.salesDecision.action,"close_sale");
});
test("creative A resources and substring Produto AB never attach to explicit Produto B/A",async()=>{
 reset();
 store.rows.leadsTable[0].origin={trafficCreative:{id:"creative-a",slug:"a",description:"Anúncio A",mediaType:"image"}};
 store.rows.resourceRequestsTable=[{id:"request-a",businessId:1,status:"fulfilled",source:"traffic_creative:creative-a",purpose:"gallery"}];
 const resource=(id,purpose,title)=>({id,businessId:1,kind:"image",purpose,title,description:title,url:`https://example.test/${id}.jpg`,status:"approved",visibility:"public",validFrom:null,validUntil:null});
 store.rows.resourceLibraryTable=[resource("a","request:request-a","Galeria A"),resource("ab","visitor_chat:image:Produto AB","Produto AB"),resource("b","visitor_chat:image:Produto B","Produto B")];
 let response=await chatWithLead("lead","Quero fotos de Produto B",1);
 assert.deepEqual(response.resources.map(r=>r.id),["b"]);
 response=await chatWithLead("lead","Quero fotos de Produto A",1);
 assert.deepEqual(response.resources,[]);
});
test("actual owner terminal state update during generation rejects stale chat CAS",async()=>{
 for(const state of ["perdido","entregue"]){
  reset();
  store.onGenerate=()=>updateLeadState("lead",state,1);
  await assert.rejects(chatWithLead("lead","Quero comprar Produto B",1),/activa/);
  assert.equal(store.rows.leadsTable[0].state,state);
  assert.equal(store.rows.leadsTable[0].chatMessages.length,0);
 }
});
test("same-turn interpreted need is removed from missing questions before generation",async()=>{
 reset();
 store.strategy.essentialQuestions=["Que resultado pretendes alcançar?","Qual o prazo?"];
 store.interpretation={intent:"information",need:"vender online",urgency:null,objection:null,evidence:["vender online"]};
 await chatWithLead("lead","Preciso de vender online",1);
 const memory=store.rows.leadsTable[0].commercialMemory;
 assert.deepEqual(memory.missingData,["Qual o prazo?"]);
 assert.deepEqual(memory.salesDecision.missingData,["Qual o prazo?"]);
 assert.match(store.generatedSystem,/Necessidade: vender online/);
 assert.match(store.generatedSystem,/"missingData":\["Qual o prazo\?"\]/);
 assert.doesNotMatch(memory.factualSummary,/Por esclarecer: Que resultado/);
});
async function completeCall(){
 const previous=process.env.GEMINI_API_KEY;
 process.env.GEMINI_API_KEY="test-injected-provider";
 try { await processCallCompletion("lead","Sou Ana. Procuro Produto B. Tenho 50.000 Kz e preciso este mês.","Loja",1); }
 finally { if(previous===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previous; }
}
function callEvidence(){
 store.extraction={qualificationData:{name:"Ana",interest:"Produto B",budget:"50.000 Kz",timeline:"este mês"},score:85,aiSummary:"Ana procura Produto B com orçamento e prazo.",whatsappMessage:""};
}
test("chat-before-call merges richer call evidence, lifecycle, summary, score and state",async()=>{
 reset();callEvidence();
 await chatWithLead("lead","Interessante",1);
 await completeCall();
 const lead=store.rows.leadsTable[0];
 assert.equal(lead.qualificationData.name,"Ana");
 assert.equal(lead.qualificationData.budget,"50.000 Kz");
 assert.equal(lead.score,85);
 assert.equal(lead.state,"qualificado");
 assert.match(lead.aiSummary,/Ana procura/);
 assert.match(lead.callTranscript,/Sou Ana/);
 assert.ok(lead.callEndedAt);
 assert.ok(lead.commercialMemory.salesDecision);
 assert.ok(lead.commercialMemory.criteria.some(x=>x.value.includes("50.000 Kz")));
});
test("call extraction rebases over concurrent chat and retries actual CAS conflict",async()=>{
 reset();callEvidence();
 store.onExtract=async()=>{
  await chatWithLead("lead","Tenho orçamento de 60.000 Kz para Produto B",1);
  store.beforeQualificationUpdate=async()=>{await chatWithLead("lead","Interessante",1)};
 };
 await completeCall();
 const lead=store.rows.leadsTable[0];
 assert.match(lead.qualificationData.budget,/60/);
 assert.equal(lead.qualificationData.name,"Ana");
 assert.equal(lead.chatMessages.length,4);
 assert.equal(lead.score,85);
 assert.ok(lead.commercialMemory.revision>=3);
 assert.equal(store.successLogs.filter(args=>args[1]==="Lead extraction complete").length,1);
});
test("weak chat never downgrades prior high score and call respects owner terminal state",async()=>{
 reset();callEvidence();
 store.rows.leadsTable[0].score=95;
 await chatWithLead("lead","Interessante",1);
 assert.equal(store.rows.leadsTable[0].score,95);
 store.onExtract=()=>updateLeadState("lead","perdido",1);
 await completeCall();
 assert.equal(store.rows.leadsTable[0].state,"perdido");
 assert.equal(store.rows.leadsTable[0].score,95);
 assert.equal(store.rows.leadsTable[0].qualificationData.name,"Ana");
 assert.ok(store.rows.leadsTable[0].callEndedAt);
});
test("exhausted extraction CAS preserves lifecycle and never reports success",async()=>{
 reset();callEvidence();
 const conflict=()=>{store.rows.leadsTable[0].commercialMemory.revision++;store.beforeQualificationUpdate=conflict};
 store.beforeQualificationUpdate=conflict;
 await completeCall();
 assert.ok(store.rows.leadsTable[0].callEndedAt);
 assert.match(store.rows.leadsTable[0].callTranscript,/Sou Ana/);
 assert.equal(store.rows.leadsTable[0].qualificationData.name,undefined);
 assert.equal((store.successLogs??[]).filter(args=>args[1]==="Lead extraction complete").length,0);
 assert.ok(store.errorLogs.some(args=>args[1]==="Post-call lead extraction failed"));
});
test("missing extraction provider still persists call lifecycle and transcript",async()=>{
 reset();
 const previous=process.env.GEMINI_API_KEY;
 delete process.env.GEMINI_API_KEY;
 try {await processCallCompletion("lead","Chamada concluída.","Loja",1)}
 finally {if(previous!==undefined)process.env.GEMINI_API_KEY=previous}
 assert.equal(store.rows.leadsTable[0].callTranscript,"Chamada concluída.");
 assert.ok(store.rows.leadsTable[0].callEndedAt);
});