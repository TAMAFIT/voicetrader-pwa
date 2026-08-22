import fs from 'node:fs';
import path from 'node:path';

export const LOCAL_LAB_SUMMARY_SCHEMA='voicetrader-local-lab-summary-v1';
export const DEFAULT_HEALTH_SPECS=Object.freeze([
  Object.freeze({id:'gmoRaw',file:'local-node-health.json',freshMs:90_000}),
  Object.freeze({id:'gmoDerived',file:'derived-gmo-health.json',freshMs:60_000}),
  Object.freeze({id:'krakenRaw',file:'kraken-microstructure-health.json',freshMs:30_000}),
  Object.freeze({id:'krakenWindows',file:'kraken-boundary-health.json',freshMs:30_000}),
  Object.freeze({id:'prospective',file:'short-horizon-prospective-health.json',freshMs:30_000}),
  Object.freeze({id:'scorecard',file:'short-horizon-scorecard-health.json',freshMs:90_000}),
]);

const round=(v,d=3)=>{const n=Number(v);if(!Number.isFinite(n))return null;const s=10**d;return Math.round(n*s)/s;};
export function readJsonIfPresent(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error?.code==='ENOENT')return null;return {__readError:String(error?.message||error)};}}
export function healthTimestampMs(health){for(const key of ['updatedAtMs','timestampMs','finishedAtMs']){const n=Number(health?.[key]);if(Number.isFinite(n))return n;}return null;}
export function summarizeHealth(spec,health,nowMs=Date.now()){
  if(!health)return {id:spec.id,present:false,state:'MISSING',ageMs:null,status:null,error:null};
  if(health.__readError)return {id:spec.id,present:true,state:'UNREADABLE',ageMs:null,status:null,error:health.__readError};
  const updatedAtMs=healthTimestampMs(health),ageMs=Number.isFinite(updatedAtMs)?Math.max(0,nowMs-updatedAtMs):null;
  const status=String(health.status||'UNKNOWN');
  let state='OK';
  if(/ERROR|FAILED|HARD_STOP|CRITICAL/i.test(status)||health.error||health.lastError)state='ERROR';
  else if(ageMs==null)state='UNKNOWN';
  else if(ageMs>spec.freshMs*3)state='STALE';
  else if(ageMs>spec.freshMs)state='LAGGING';
  return {id:spec.id,present:true,state,status,updatedAtMs,ageMs,error:health.error||health.lastError||null};
}
export function directorySizeBytes(root,{maxFiles=200_000}={}){
  if(!fs.existsSync(root))return {bytes:0,files:0,truncated:false};
  let bytes=0,files=0,truncated=false;const stack=[root];
  while(stack.length){const dir=stack.pop();let entries=[];try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{continue;}for(const ent of entries){const p=path.join(dir,ent.name);if(ent.isDirectory())stack.push(p);else if(ent.isFile()){files+=1;try{bytes+=fs.statSync(p).size;}catch{}if(files>=maxFiles){truncated=true;stack.length=0;break;}}}}
  return {bytes,files,truncated};
}
function diskFreeBytes(rootDir){try{const s=fs.statfsSync(rootDir);return Number(s.bavail)*Number(s.bsize);}catch{return null;}}
function compactKraken(h){return h?{messages:h.counts?.messages??0,book:h.counts?.book??0,trade:h.counts?.trade??0,checksumMatches:h.counts?.checksumMatches??0,checksumMismatches:h.counts?.checksumMismatches??0,bookFeatures:h.counts?.bookFeatures??0,tradeFeatures:h.counts?.tradeFeatures??0,bookSynchronized:h.integrity?.bookSynchronizationVerified??false,ofiAvailable:h.semantics?.ofiAvailable??false,micropriceAvailable:h.semantics?.micropriceAvailable??false}:null;}
function compactProspective(h){return h?{signals:h.counts?.signalsWritten??0,outcomes:h.counts?.outcomesWritten??0,postMortems:h.counts?.postMortemsWritten??0,adaptiveUpdates:h.counts?.adaptiveUpdates??0,blindRetired:h.counts?.blindOutcomesRetired??0,adaptiveBlindSkips:h.counts?.adaptiveLearningSkippedBlind??0,pending:Object.keys(h.pending||{}).length,adaptiveStateVersion:h.adaptiveState?.stateVersion??0}:null;}
function compactScorecard(h,scorecard){const blind=scorecard?.comparisons?.frozenVsAdaptive?.BLIND_EXAM;const learning=scorecard?.comparisons?.frozenVsAdaptive?.LEARNING_STREAM;return {outcomesProcessed:h?.outcomesProcessed??scorecard?.coverage?.outcomesProcessed??0,blindExamReadiness:h?.blindExamReadiness??scorecard?.blindExamReadiness??null,frozenVsAdaptive:{learning,blind},primaryVsNull:{learning:scorecard?.comparisons?.primaryVsNull?.LEARNING_STREAM??null,blind:scorecard?.comparisons?.primaryVsNull?.BLIND_EXAM??null}};}
export function buildLocalLabSummary(rootDir,{nowMs=Date.now(),includeSizes=true,maxFiles=200_000}={}){
  const root=path.resolve(rootDir),stateDir=path.join(root,'state');const rawHealth={};const workers={};
  for(const spec of DEFAULT_HEALTH_SPECS){const h=readJsonIfPresent(path.join(stateDir,spec.file));rawHealth[spec.id]=h;workers[spec.id]=summarizeHealth(spec,h,nowMs);}
  const scorecard=readJsonIfPresent(path.join(root,'research','kraken','scorecards','current.json'));
  const sizes={};if(includeSizes){for(const name of ['raw','derived','research','logs']){const s=directorySizeBytes(path.join(root,name),{maxFiles});sizes[name]={...s,gb:round(s.bytes/1024**3,4)};}}
  const free=diskFreeBytes(root);const workerStates=Object.values(workers).map((w)=>w.state);let overall='HEALTHY';if(workerStates.includes('ERROR')||workerStates.includes('UNREADABLE'))overall='ERROR';else if(workerStates.includes('STALE'))overall='STALE';else if(workerStates.includes('LAGGING')||workerStates.includes('MISSING'))overall='DEGRADED';
  return {schemaVersion:LOCAL_LAB_SUMMARY_SCHEMA,generatedAtMs:nowMs,generatedAtIso:new Date(nowMs).toISOString(),overall,dataRoot:root,workers,market:{gmo:{status:rawHealth.gmoRaw?.status??null,lastQuote:rawHealth.gmoRaw?.lastQuote??null,storedQuotes:rawHealth.gmoRaw?.counts?.storedQuotes??0},kraken:compactKraken(rawHealth.krakenRaw)},research:{prospective:compactProspective(rawHealth.prospective),scorecard:compactScorecard(rawHealth.scorecard,scorecard)},storage:{freeBytes:free,freeGb:round(Number(free)/1024**3,3),sizes},safety:{googleCloudEnabled:false,cloudUploadEnabled:false,githubActionsRequired:false,orderSubmission:false,realMoneyRouting:false,automaticPromotion:false},notes:{rawAuthoritative:true,derivedRebuildable:true,blindExamIsolated:true,scorecardsDescriptiveOnly:true}};
}
