import { ShadowEngine } from '../engine/shadow-engine.js';
import { HumanKnowledgeEngine } from '../knowledge/human-knowledge-engine.js';
import { HumanPlaybookEngine } from '../knowledge/playbook-engine.js';
import { HigherTimeframeContextEngine } from '../knowledge/higher-timeframe-engine.js';
import { buildCandidateDecision } from './knowledge-candidate-tournament.js';
import { estimateResearchRoundTripCostBps, RESEARCH_COST_MODEL_VERSION } from './research-cost-model.js';
import {
  ETH_FORWARD_EPOCH,
  ETH_FORWARD_EPOCH_ID,
  ETH_FORWARD_FREEZE_UNIX,
  ETH_FORWARD_HORIZON_BARS,
  ETH_FORWARD_SOURCE_IDS,
  assertEthForwardEpochRuntime,
} from './eth-forward-epoch.js';

export const ETH_FORWARD_RUNNER_VERSION='eth-forward-runner-0.1';
const round=(value,digits=2)=>{const n=Number(value);if(!Number.isFinite(n))return null;const s=10**digits;return Math.round(n*s)/s;};
const sideFromDecision=decision=>decision==='ENTER_LONG'?'LONG':decision==='ENTER_SHORT'?'SHORT':null;

export function isEthForwardEligibleBar(bar){return Number(bar?.t)>ETH_FORWARD_FREEZE_UNIX;}
export function getEthForwardEligibleIndexes(series=[],endIndex=series.length-1){const safeEnd=Math.min(Number(endIndex??series.length-1),series.length-1);const out=[];for(let idx=0;idx<=safeEnd;idx++)if(isEthForwardEligibleBar(series[idx]))out.push(idx);return out;}

function outcome(series,entryIndex,exitIndex,side,costBps){const entryPrice=Number(series[entryIndex]?.c),exitPrice=Number(series[exitIndex]?.c);if(!(entryPrice>0)||!(exitPrice>0))return null;const gross=side==='LONG'?(exitPrice/entryPrice-1)*10000:((entryPrice-exitPrice)/entryPrice)*10000;return {entryPrice,exitPrice,grossReturnBps:round(gross),netReturnBps:round(gross-Math.max(0,Number(costBps)||0))};}
function candidateSnapshot(wave1,wave2,candidateId){return {candidateId,decision:buildCandidateDecision(candidateId,wave1,wave2),wave1Decision:wave1.entryDecision,wave1KnowledgeScore:wave1.knowledgeScore,wave1FamilyAgreement:wave1.familyAgreement,wave2Decision:wave2.entryDecision,wave2PlaybookScore:wave2.playbookScore,wave2ArchetypeAgreement:wave2.archetypeAgreement,regime:wave1.context?.regime||'unknown',riskGate:wave1.context?.riskGate||'unknown'};}
function decisionRecord({sourceId,role,idx,series,decision,dataSignature,details}){const candleTime=Number(series[idx]?.t)||null;return {decisionKey:`${ETH_FORWARD_EPOCH_ID}:${sourceId}:${candleTime}`,epochId:ETH_FORWARD_EPOCH_ID,instrument:'ETHUSD',sourceId,role,barIndex:idx,candleTime,decision,dataSignature,observedProspectively:true,usedFutureOutcomeAtDecision:false,details};}
function evidenceRecord({sourceId,role,entryIndex,exitIndex,series,decision,side,costBps,dataSignature,details}){const entryTime=Number(series[entryIndex]?.t)||null,exitTime=Number(series[exitIndex]?.t)||null,calculated=outcome(series,entryIndex,exitIndex,side,costBps);if(!calculated)return null;return {evidenceKey:`${ETH_FORWARD_EPOCH_ID}:${sourceId}:${entryTime}:${exitTime}:${side}`,epochId:ETH_FORWARD_EPOCH_ID,instrument:'ETHUSD',sourceId,role,decision,side,entryIndex,exitIndex,entryTime,exitTime,holdingBars:ETH_FORWARD_HORIZON_BARS,estimatedRoundTripCostBps:round(costBps,4),costModelVersion:RESEARCH_COST_MODEL_VERSION,costUsesEntryBarInformationOnly:true,dataSignature,observedProspectively:true,futureOutcomeUsedByDecision:false,details,...calculated};}

function evaluateSource({sourceId,role,series,eligibleIndexes,safeEnd,knowledgeMap,htfMap,championMap,dataSignature}){
  const decisions=[],evidence=[];let nextFree=eligibleIndexes.length?eligibleIndexes[0]:Infinity;
  for(const idx of eligibleIndexes){let decision='NO_ENTRY',details={};
    if(sourceId==='champion-001'){const a=championMap.get(idx);if(!a)continue;decision=a.entryDecision||'NO_ENTRY';details={engineVersion:a.engineVersion,rawAlphaScore:a.rawAlphaScore,decisionScore:a.decisionScore,confidenceScore:a.conf};}
    else if(sourceId==='higher-timeframe-wave3-reference'){const a=htfMap.get(idx);if(!a)continue;decision=a.entryDecision||'NO_ENTRY';details={engineVersion:a.engineVersion,registryVersion:a.registryVersion,rawContextScore:a.rawContextScore,activeAlphaCount:a.activeAlphaCount,alphaAgreement:a.alphaAgreement,gateReason:a.gateReason,dailyRegime:a.context?.dailyRegime,dailyDirection:a.context?.dailyDirection,lastDailyBarCloseTime:a.context?.lastDailyBarCloseTime};}
    else {const pair=knowledgeMap.get(idx);if(!pair)continue;const snap=candidateSnapshot(pair.wave1,pair.wave2,sourceId);decision=snap.decision;details=snap;}
    decisions.push(decisionRecord({sourceId,role,idx,series,decision,dataSignature,details}));
    if(idx<nextFree)continue;const side=sideFromDecision(decision);if(!side)continue;const exitIndex=idx+ETH_FORWARD_HORIZON_BARS;if(exitIndex>safeEnd||!series[exitIndex])continue;const entryTime=Number(series[idx]?.t),exitTime=Number(series[exitIndex]?.t);if(!(entryTime>ETH_FORWARD_FREEZE_UNIX)||!(exitTime>ETH_FORWARD_FREEZE_UNIX))continue;const costBps=estimateResearchRoundTripCostBps(series,idx,'ETHUSD');if(!Number.isFinite(Number(costBps)))continue;const record=evidenceRecord({sourceId,role,entryIndex:idx,exitIndex,series,decision,side,costBps,dataSignature,details});if(!record)continue;evidence.push(record);nextFree=exitIndex+1;
  }
  return {decisions,evidence};
}

export function runEthForwardSnapshot({series,endIndex,dataSignature='unknown'}={}){
  try{assertEthForwardEpochRuntime();}catch(error){return {version:ETH_FORWARD_RUNNER_VERSION,status:'blocked',reason:error.message};}
  if(!Array.isArray(series)||!series.length)return {version:ETH_FORWARD_RUNNER_VERSION,status:'unavailable',reason:'missing-series'};
  const sourceBefore=JSON.stringify(series);const safeEnd=Math.min(Number(endIndex??series.length-1),series.length-1);const eligibleIndexes=getEthForwardEligibleIndexes(series,safeEnd);
  const wave1Engine=new HumanKnowledgeEngine(),wave2Engine=new HumanPlaybookEngine(),htfEngine=new HigherTimeframeContextEngine(),championEngine=new ShadowEngine({seriesProvider:()=>series});const knowledgeMap=new Map(),htfMap=new Map(),championMap=new Map();
  for(const idx of eligibleIndexes){const wave1=wave1Engine.analyze(series,idx),wave2=wave2Engine.analyze(series,idx),htf=htfEngine.analyze(series,idx);if(wave1.status==='complete'&&wave2.status==='complete')knowledgeMap.set(idx,{wave1,wave2});if(htf.status==='complete')htfMap.set(idx,htf);championMap.set(idx,championEngine.analyze('ETHUSD',idx));}
  const sources=ETH_FORWARD_SOURCE_IDS.map(id=>({id,role:id==='champion-001'?'benchmark':'candidate'}));const decisions=[],evidence=[];for(const source of sources){const result=evaluateSource({sourceId:source.id,role:source.role,series,eligibleIndexes,safeEnd,knowledgeMap,htfMap,championMap,dataSignature});decisions.push(...result.decisions);evidence.push(...result.evidence);}
  const observedBarTimes=eligibleIndexes.map(idx=>Number(series[idx]?.t)).filter(Number.isFinite);
  if(JSON.stringify(series)!==sourceBefore)return {version:ETH_FORWARD_RUNNER_VERSION,status:'blocked',reason:'source-series-mutated'};
  return {version:ETH_FORWARD_RUNNER_VERSION,status:'complete',epoch:ETH_FORWARD_EPOCH,dataSignature,endIndex:safeEnd,observedBarTimes,decisions,evidence,methodology:{prospectiveCrossMarketOnly:true,instrument:'ETHUSD',sourceStrategyDevelopedOnBTC:true,ethSpecificTuning:false,candleOpenTimestampStrictlyAfterFreeze:true,preFreezeEthBarsContextOnly:true,preFreezePnlForbidden:true,fixedHorizonBars:ETH_FORWARD_HORIZON_BARS,exitMustBeInsideObservedEndIndex:true,independentNonOverlappingPathPerSource:true,deterministicEntryBarCost:true,costModelVersion:RESEARCH_COST_MODEL_VERSION,fullyClosedDailyContextOnly:true,futureFourHourBarsForbidden:true,noFitting:true,optimizer:false,parameterSweep:false,selfLearning:false,adaptiveWeights:false,automaticSelection:false,automaticPromotion:false,promotionEligible:false,pooledBtcEthPromotionScore:false,usedByLiveDecisionEngine:false,existingBtcForwardStreamsUnchanged:true}};
}
