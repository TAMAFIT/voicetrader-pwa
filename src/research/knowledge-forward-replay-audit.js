import { KNOWLEDGE_CANDIDATE_HORIZON_BARS } from './knowledge-candidate-registry.js';
import { KNOWLEDGE_FORWARD_EPOCH_ID, KNOWLEDGE_FORWARD_FREEZE_UNIX } from './knowledge-forward-epoch.js';
import { estimateResearchRoundTripCostBps, RESEARCH_COST_MODEL_VERSION } from './research-cost-model.js';
import { FOUR_HOURS_SECONDS, FROZEN_KNOWLEDGE_EVALUATOR_COMMIT } from './knowledge-forward-remote.js';

export const KNOWLEDGE_FORWARD_REPLAY_AUDIT_VERSION='knowledge-forward-replay-audit-0.1';
const EXPECTED_SOURCES=Object.freeze([
  {id:'champion-001',role:'benchmark'},
  {id:'candidate-wave1-reference',role:'candidate'},
  {id:'candidate-playbook-reference',role:'candidate'},
  {id:'candidate-consensus',role:'candidate'},
  {id:'candidate-playbook-wave1-veto',role:'candidate'},
]);
const VALID_DECISIONS=new Set(['ENTER_LONG','ENTER_SHORT','NO_ENTRY']);
const round=(value,digits=2)=>{const n=Number(value);if(!Number.isFinite(n))return null;const s=10**digits;return Math.round(n*s)/s;};
const approx=(a,b,tolerance=.000001)=>Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<=tolerance;
const sideFromDecision=decision=>decision==='ENTER_LONG'?'LONG':decision==='ENTER_SHORT'?'SHORT':null;

function addError(errors,code,detail={}){errors.push({code,...detail});}
function expectedDecisionKey(sourceId,candleTime){return `${KNOWLEDGE_FORWARD_EPOCH_ID}:${sourceId}:${candleTime}`;}
function expectedEvidenceKey(sourceId,entryTime,exitTime,side){return `${KNOWLEDGE_FORWARD_EPOCH_ID}:${sourceId}:${entryTime}:${exitTime}:${side}`;}
function expectedRole(sourceId){return sourceId==='champion-001'?'benchmark':'candidate';}
function calculateOutcome(series,entryIndex,exitIndex,side,costBps){
  const entryPrice=Number(series[entryIndex]?.c),exitPrice=Number(series[exitIndex]?.c);
  if(!(entryPrice>0)||!(exitPrice>0))return null;
  const gross=side==='LONG'?(exitPrice/entryPrice-1)*10000:((entryPrice-exitPrice)/entryPrice)*10000;
  return {entryPrice,exitPrice,grossReturnBps:round(gross,2),netReturnBps:round(gross-Math.max(0,Number(costBps)||0),2)};
}

function auditMarketBars(series,errors){
  const byTime=new Map();
  let previous=null;
  for(let index=0;index<series.length;index++){
    const bar=series[index]||{};
    const t=Number(bar.t),o=Number(bar.o),h=Number(bar.h),l=Number(bar.l),c=Number(bar.c);
    if(![t,o,h,l,c].every(Number.isFinite)||![o,h,l,c].every(value=>value>0)){addError(errors,'market-invalid-number',{index,t});continue;}
    if(byTime.has(t))addError(errors,'market-duplicate-timestamp',{index,t});
    if(previous!==null){
      if(t<=previous)addError(errors,'market-not-strictly-increasing',{index,t,previous});
      if(t-previous!==FOUR_HOURS_SECONDS)addError(errors,'market-4h-gap',{index,t,previous,deltaSeconds:t-previous});
    }
    if(h<Math.max(o,c)||l>Math.min(o,c)||h<l)addError(errors,'market-ohlc-inconsistent',{index,t});
    byTime.set(t,index);previous=t;
  }
  return byTime;
}

function auditObservedTimes(observedRaw,marketIndex,errors){
  const observed=[];const seen=new Set();let previous=null;
  for(const raw of observedRaw||[]){
    const t=Number(raw);
    if(!Number.isFinite(t)){addError(errors,'observed-invalid-timestamp',{value:raw});continue;}
    if(seen.has(t))addError(errors,'observed-duplicate-timestamp',{t});
    if(!(t>KNOWLEDGE_FORWARD_FREEZE_UNIX))addError(errors,'observed-not-strictly-post-freeze',{t});
    if(!marketIndex.has(t))addError(errors,'observed-time-not-in-market',{t});
    if(previous!==null&&t-previous!==FOUR_HOURS_SECONDS)addError(errors,'observed-4h-gap',{t,previous,deltaSeconds:t-previous});
    seen.add(t);observed.push(t);previous=t;
  }
  return {observed,observedSet:seen};
}

function auditDecisions(decisions,observedSet,errors){
  const sourceMap=new Map(EXPECTED_SOURCES.map(item=>[item.id,item]));
  const keyed=new Map();
  const bySourceTime=new Map(EXPECTED_SOURCES.map(item=>[item.id,new Map()]));
  for(const item of decisions||[]){
    const sourceId=item?.sourceId,candleTime=Number(item?.candleTime),key=item?.decisionKey;
    if(!sourceMap.has(sourceId)){addError(errors,'decision-unknown-source',{sourceId,key});continue;}
    if(key!==expectedDecisionKey(sourceId,candleTime))addError(errors,'decision-key-mismatch',{sourceId,candleTime,key});
    if(keyed.has(key))addError(errors,'decision-duplicate-key',{key});else keyed.set(key,item);
    if(!observedSet.has(candleTime))addError(errors,'decision-time-not-observed',{sourceId,candleTime});
    if(!VALID_DECISIONS.has(item?.decision))addError(errors,'decision-invalid-enum',{sourceId,candleTime,decision:item?.decision});
    if(item?.role!==expectedRole(sourceId))addError(errors,'decision-role-mismatch',{sourceId,candleTime,role:item?.role});
    if(item?.observedProspectively!==true)addError(errors,'decision-not-prospective',{sourceId,candleTime});
    if(item?.usedFutureOutcomeAtDecision!==false)addError(errors,'decision-future-flag-invalid',{sourceId,candleTime});
    const map=bySourceTime.get(sourceId);if(map.has(candleTime))addError(errors,'decision-duplicate-source-time',{sourceId,candleTime});else map.set(candleTime,item);
  }
  for(const {id} of EXPECTED_SOURCES)for(const t of observedSet)if(!bySourceTime.get(id).has(t))addError(errors,'decision-coverage-missing',{sourceId:id,candleTime:t});
  return {keyed,bySourceTime};
}

function auditEvidenceRecords({evidence,series,marketIndex,observedSet,decisionsBySourceTime,errors}){
  const keyed=new Map();const bySource=new Map(EXPECTED_SOURCES.map(item=>[item.id,[]]));
  for(const item of evidence||[]){
    const sourceId=item?.sourceId,entryTime=Number(item?.entryTime),exitTime=Number(item?.exitTime),side=item?.side,key=item?.evidenceKey;
    if(!bySource.has(sourceId)){addError(errors,'evidence-unknown-source',{sourceId,key});continue;}
    if(key!==expectedEvidenceKey(sourceId,entryTime,exitTime,side))addError(errors,'evidence-key-mismatch',{sourceId,entryTime,exitTime,key});
    if(keyed.has(key))addError(errors,'evidence-duplicate-key',{key});else keyed.set(key,item);
    if(item?.role!==expectedRole(sourceId))addError(errors,'evidence-role-mismatch',{sourceId,key});
    if(item?.observedProspectively!==true)addError(errors,'evidence-not-prospective',{sourceId,key});
    if(item?.futureOutcomeUsedByDecision!==false)addError(errors,'evidence-future-flag-invalid',{sourceId,key});
    if(item?.costUsesEntryBarInformationOnly!==true)addError(errors,'evidence-cost-information-flag-invalid',{sourceId,key});
    if(item?.costModelVersion!==RESEARCH_COST_MODEL_VERSION)addError(errors,'evidence-cost-model-mismatch',{sourceId,key,costModelVersion:item?.costModelVersion});
    if(!(entryTime>KNOWLEDGE_FORWARD_FREEZE_UNIX)||!(exitTime>entryTime))addError(errors,'evidence-time-invalid',{sourceId,key,entryTime,exitTime});
    if(!observedSet.has(entryTime)||!observedSet.has(exitTime))addError(errors,'evidence-time-not-observed',{sourceId,key,entryTime,exitTime});
    const entryIndex=marketIndex.get(entryTime),exitIndex=marketIndex.get(exitTime);
    if(!Number.isInteger(entryIndex)||!Number.isInteger(exitIndex)){addError(errors,'evidence-time-not-in-market',{sourceId,key});continue;}
    if(exitIndex!==entryIndex+KNOWLEDGE_CANDIDATE_HORIZON_BARS)addError(errors,'evidence-horizon-mismatch',{sourceId,key,entryIndex,exitIndex});
    if(Number(item?.holdingBars)!==KNOWLEDGE_CANDIDATE_HORIZON_BARS)addError(errors,'evidence-holding-bars-mismatch',{sourceId,key,holdingBars:item?.holdingBars});
    if(Number(item?.entryIndex)!==entryIndex||Number(item?.exitIndex)!==exitIndex)addError(errors,'evidence-index-mismatch',{sourceId,key,entryIndex,exitIndex,storedEntryIndex:item?.entryIndex,storedExitIndex:item?.exitIndex});
    const decision=decisionsBySourceTime.get(sourceId)?.get(entryTime);
    const expectedSide=sideFromDecision(decision?.decision);
    if(!decision)addError(errors,'evidence-originating-decision-missing',{sourceId,key,entryTime});
    else if(expectedSide!==side||item?.decision!==decision.decision)addError(errors,'evidence-side-decision-mismatch',{sourceId,key,side,decision:decision?.decision});
    const expectedCost=estimateResearchRoundTripCostBps(series,entryIndex,'BTCUSD');
    if(!approx(item?.estimatedRoundTripCostBps,expectedCost,.00011))addError(errors,'evidence-cost-mismatch',{sourceId,key,stored:item?.estimatedRoundTripCostBps,expected:expectedCost});
    const outcome=calculateOutcome(series,entryIndex,exitIndex,side,expectedCost);
    if(!outcome){addError(errors,'evidence-outcome-unavailable',{sourceId,key});continue;}
    if(!approx(item?.entryPrice,outcome.entryPrice,.000001))addError(errors,'evidence-entry-price-mismatch',{sourceId,key,stored:item?.entryPrice,expected:outcome.entryPrice});
    if(!approx(item?.exitPrice,outcome.exitPrice,.000001))addError(errors,'evidence-exit-price-mismatch',{sourceId,key,stored:item?.exitPrice,expected:outcome.exitPrice});
    if(!approx(item?.grossReturnBps,outcome.grossReturnBps,.011))addError(errors,'evidence-gross-bps-mismatch',{sourceId,key,stored:item?.grossReturnBps,expected:outcome.grossReturnBps});
    if(!approx(item?.netReturnBps,outcome.netReturnBps,.011))addError(errors,'evidence-net-bps-mismatch',{sourceId,key,stored:item?.netReturnBps,expected:outcome.netReturnBps});
    bySource.get(sourceId).push(item);
  }
  for(const [sourceId,items] of bySource){
    const sorted=[...items].sort((a,b)=>Number(a.entryTime)-Number(b.entryTime));
    let lastExit=-Infinity;
    for(const item of sorted){if(Number(item.entryTime)<=lastExit)addError(errors,'evidence-source-overlap',{sourceId,entryTime:item.entryTime,lastExit});lastExit=Math.max(lastExit,Number(item.exitTime)||-Infinity);}
  }
  return {keyed,bySource};
}

function auditEvidenceCompleteness({series,marketIndex,observed,observedSet,decisionsBySourceTime,evidenceKeyed,errors}){
  for(const {id:sourceId} of EXPECTED_SOURCES){
    let nextFreeIndex=observed.length?marketIndex.get(observed[0]):-Infinity;
    const expectedKeys=[];
    for(const entryTime of observed){
      const entryIndex=marketIndex.get(entryTime);if(!Number.isInteger(entryIndex)||entryIndex<nextFreeIndex)continue;
      const decision=decisionsBySourceTime.get(sourceId)?.get(entryTime);
      const side=sideFromDecision(decision?.decision);if(!side)continue;
      const exitIndex=entryIndex+KNOWLEDGE_CANDIDATE_HORIZON_BARS;
      const exitTime=Number(series[exitIndex]?.t);
      if(!Number.isFinite(exitTime)||!observedSet.has(exitTime))continue;
      const key=expectedEvidenceKey(sourceId,entryTime,exitTime,side);expectedKeys.push(key);
      if(!evidenceKeyed.has(key))addError(errors,'evidence-expected-record-missing',{sourceId,entryTime,exitTime,key});
      nextFreeIndex=exitIndex+1;
    }
    for(const item of evidenceKeyed.values())if(item?.sourceId===sourceId&&!expectedKeys.includes(item.evidenceKey))addError(errors,'evidence-unexpected-record',{sourceId,key:item.evidenceKey});
  }
}

export function auditKnowledgeForwardRemoteDocument(remoteDocument){
  const errors=[];const raw=remoteDocument||{};
  if(raw.epochId!==KNOWLEDGE_FORWARD_EPOCH_ID)addError(errors,'archive-epoch-mismatch',{actual:raw.epochId});
  if(raw.frozenEvaluatorCommit!==FROZEN_KNOWLEDGE_EVALUATOR_COMMIT)addError(errors,'archive-frozen-evaluator-mismatch',{actual:raw.frozenEvaluatorCommit});
  if(raw.evidenceArchive?.epochId!==KNOWLEDGE_FORWARD_EPOCH_ID)addError(errors,'evidence-archive-epoch-mismatch',{actual:raw.evidenceArchive?.epochId});
  if(raw.collector?.evaluatorCommit&&raw.collector.evaluatorCommit!==FROZEN_KNOWLEDGE_EVALUATOR_COMMIT)addError(errors,'collector-evaluator-mismatch',{actual:raw.collector?.evaluatorCommit});
  if(raw.collector?.status!=='success')addError(errors,'collector-status-not-success',{actual:raw.collector?.status});
  if((raw.collector?.marketConflicts||[]).length)addError(errors,'collector-market-conflicts',{count:raw.collector.marketConflicts.length});
  const series=Array.isArray(raw.market?.bars)?raw.market.bars:[];
  if(!series.length)addError(errors,'market-archive-empty');
  const marketIndex=auditMarketBars(series,errors);
  const {observed,observedSet}=auditObservedTimes(raw.evidenceArchive?.observedBarTimes||[],marketIndex,errors);
  if(!observed.length)addError(errors,'observed-prospective-empty');
  const decisions=auditDecisions(raw.evidenceArchive?.decisions||[],observedSet,errors);
  const evidence=auditEvidenceRecords({evidence:raw.evidenceArchive?.evidence||[],series,marketIndex,observedSet,decisionsBySourceTime:decisions.bySourceTime,errors});
  auditEvidenceCompleteness({series,marketIndex,observed,observedSet,decisionsBySourceTime:decisions.bySourceTime,evidenceKeyed:evidence.keyed,errors});
  const uniqueCodes=[...new Set(errors.map(item=>item.code))];
  return {
    version:KNOWLEDGE_FORWARD_REPLAY_AUDIT_VERSION,
    status:errors.length?'fail':'pass',
    pass:errors.length===0,
    epochId:KNOWLEDGE_FORWARD_EPOCH_ID,
    frozenEvaluatorCommit:FROZEN_KNOWLEDGE_EVALUATOR_COMMIT,
    researchCostModelVersion:RESEARCH_COST_MODEL_VERSION,
    checked:{marketBars:series.length,observedBars:observed.length,decisionRecords:(raw.evidenceArchive?.decisions||[]).length,evidenceRecords:(raw.evidenceArchive?.evidence||[]).length,sources:EXPECTED_SOURCES.length},
    errorCount:errors.length,
    errorCodes:uniqueCodes,
    errors,
    methodology:{
      fullMarketReplay:true,
      decisionKeyReplay:true,
      evidenceKeyReplay:true,
      originatingDecisionRequired:true,
      exactFixedHorizonBars:KNOWLEDGE_CANDIDATE_HORIZON_BARS,
      entryBarCostRecomputed:true,
      grossNetBpsRecomputed:true,
      evidenceCompletenessReplay:true,
      independentSourceNonOverlap:true,
      futureDecisionUseForbidden:true,
      downstreamAuditOnly:true,
      changesFrozenDecisionEngine:false,
      optimizer:false,
      fitting:false,
      usedByLiveDecisionEngine:false,
    },
  };
}
