import { ShadowEngine } from '../engine/shadow-engine.js';
import { HigherTimeframeContextEngine } from '../knowledge/higher-timeframe-engine.js';
import { estimateResearchRoundTripCostBps, RESEARCH_COST_MODEL_VERSION } from './research-cost-model.js';
import {
  HIGHER_TIMEFRAME_FORWARD_BENCHMARK_ID,
  HIGHER_TIMEFRAME_FORWARD_EPOCH,
  HIGHER_TIMEFRAME_FORWARD_EPOCH_ID,
  HIGHER_TIMEFRAME_FORWARD_FREEZE_UNIX,
  HIGHER_TIMEFRAME_FORWARD_SOURCE_ID,
  assertHigherTimeframeForwardEpochRuntime,
} from './higher-timeframe-forward-epoch.js';

export const HIGHER_TIMEFRAME_FORWARD_RUNNER_VERSION='higher-timeframe-forward-runner-0.1';
const round=(value,digits=2)=>{const n=Number(value);if(!Number.isFinite(n))return null;const s=10**digits;return Math.round(n*s)/s;};
const sideFromDecision=decision=>decision==='ENTER_LONG'?'LONG':decision==='ENTER_SHORT'?'SHORT':null;

export function isHigherTimeframeForwardEligibleBar(bar){return Number(bar?.t)>HIGHER_TIMEFRAME_FORWARD_FREEZE_UNIX;}
export function getHigherTimeframeForwardEligibleIndexes(series=[],endIndex=series.length-1){const safeEnd=Math.min(Number(endIndex??series.length-1),series.length-1);const out=[];for(let idx=0;idx<=safeEnd;idx++)if(isHigherTimeframeForwardEligibleBar(series[idx]))out.push(idx);return out;}

function outcome(series,entryIndex,exitIndex,side,costBps){
  const entryPrice=Number(series[entryIndex]?.c),exitPrice=Number(series[exitIndex]?.c);if(!(entryPrice>0)||!(exitPrice>0))return null;
  const gross=side==='LONG'?(exitPrice/entryPrice-1)*10000:((entryPrice-exitPrice)/entryPrice)*10000;
  return {entryPrice,exitPrice,grossReturnBps:round(gross),netReturnBps:round(gross-Math.max(0,Number(costBps)||0))};
}

function decisionRecord({sourceId,role,idx,series,decision,dataSignature,details}){const candleTime=Number(series[idx]?.t)||null;return {decisionKey:`${HIGHER_TIMEFRAME_FORWARD_EPOCH_ID}:${sourceId}:${candleTime}`,epochId:HIGHER_TIMEFRAME_FORWARD_EPOCH_ID,sourceId,role,barIndex:idx,candleTime,decision,dataSignature,observedProspectively:true,usedFutureOutcomeAtDecision:false,details};}
function evidenceRecord({sourceId,role,entryIndex,exitIndex,series,decision,side,costBps,dataSignature,details}){const entryTime=Number(series[entryIndex]?.t)||null,exitTime=Number(series[exitIndex]?.t)||null;const calculated=outcome(series,entryIndex,exitIndex,side,costBps);if(!calculated)return null;return {evidenceKey:`${HIGHER_TIMEFRAME_FORWARD_EPOCH_ID}:${sourceId}:${entryTime}:${exitTime}:${side}`,epochId:HIGHER_TIMEFRAME_FORWARD_EPOCH_ID,sourceId,role,decision,side,entryIndex,exitIndex,entryTime,exitTime,holdingBars:HIGHER_TIMEFRAME_FORWARD_EPOCH.horizonBars,estimatedRoundTripCostBps:round(costBps,4),costModelVersion:RESEARCH_COST_MODEL_VERSION,costUsesEntryBarInformationOnly:true,dataSignature,observedProspectively:true,futureOutcomeUsedByDecision:false,details,...calculated};}

function evaluatePath({sourceId,role,series,eligibleIndexes,safeEnd,wave3Map,championMap,dataSignature}){
  const decisions=[],evidence=[];let nextFree=eligibleIndexes.length?eligibleIndexes[0]:Infinity;
  for(const idx of eligibleIndexes){
    let decision='NO_ENTRY',details={};
    if(role==='candidate'){
      const analysis=wave3Map.get(idx);if(!analysis)continue;decision=analysis.entryDecision||'NO_ENTRY';details={engineVersion:analysis.engineVersion,registryVersion:analysis.registryVersion,rawContextScore:analysis.rawContextScore,activeAlphaCount:analysis.activeAlphaCount,alphaAgreement:analysis.alphaAgreement,gateReason:analysis.gateReason,dailyRegime:analysis.context?.dailyRegime,dailyDirection:analysis.context?.dailyDirection,lastDailyBarCloseTime:analysis.context?.lastDailyBarCloseTime};
    }else{
      const analysis=championMap.get(idx);if(!analysis)continue;decision=analysis.entryDecision==='ENTER_LONG'||analysis.entryDecision==='ENTER_SHORT'||analysis.entryDecision==='NO_ENTRY'?analysis.entryDecision:analysis.action==='BUY'?'ENTER_LONG':analysis.action==='SELL'?'ENTER_SHORT':'NO_ENTRY';details={engineVersion:analysis.engineVersion,rawAlphaScore:analysis.rawAlphaScore,decisionScore:analysis.decisionScore,confidenceScore:analysis.conf};
    }
    decisions.push(decisionRecord({sourceId,role,idx,series,decision,dataSignature,details}));
    if(idx<nextFree)continue;const side=sideFromDecision(decision);if(!side)continue;
    const exitIndex=idx+HIGHER_TIMEFRAME_FORWARD_EPOCH.horizonBars;if(exitIndex>safeEnd||!series[exitIndex])continue;
    const entryTime=Number(series[idx]?.t),exitTime=Number(series[exitIndex]?.t);if(!(entryTime>HIGHER_TIMEFRAME_FORWARD_FREEZE_UNIX)||!(exitTime>HIGHER_TIMEFRAME_FORWARD_FREEZE_UNIX))continue;
    const costBps=estimateResearchRoundTripCostBps(series,idx,'BTCUSD');if(!Number.isFinite(Number(costBps)))continue;
    const record=evidenceRecord({sourceId,role,entryIndex:idx,exitIndex,series,decision,side,costBps,dataSignature,details});if(!record)continue;evidence.push(record);nextFree=exitIndex+1;
  }
  return {decisions,evidence};
}

export function runHigherTimeframeForwardSnapshot({series,endIndex,dataSignature='unknown'}={}){
  try{assertHigherTimeframeForwardEpochRuntime();}catch(error){return {version:HIGHER_TIMEFRAME_FORWARD_RUNNER_VERSION,status:'blocked',reason:error.message};}
  if(!Array.isArray(series)||!series.length)return {version:HIGHER_TIMEFRAME_FORWARD_RUNNER_VERSION,status:'unavailable',reason:'missing-series'};
  const sourceBefore=JSON.stringify(series);const safeEnd=Math.min(Number(endIndex??series.length-1),series.length-1);const eligibleIndexes=getHigherTimeframeForwardEligibleIndexes(series,safeEnd);
  const wave3Engine=new HigherTimeframeContextEngine();const championEngine=new ShadowEngine({seriesProvider:()=>series});const wave3Map=new Map(),championMap=new Map();
  for(const idx of eligibleIndexes){const wave3=wave3Engine.analyze(series,idx);if(wave3.status==='complete')wave3Map.set(idx,wave3);championMap.set(idx,championEngine.analyze('BTCUSD',idx));}
  const candidate=evaluatePath({sourceId:HIGHER_TIMEFRAME_FORWARD_SOURCE_ID,role:'candidate',series,eligibleIndexes,safeEnd,wave3Map,championMap,dataSignature});
  const benchmark=evaluatePath({sourceId:HIGHER_TIMEFRAME_FORWARD_BENCHMARK_ID,role:'benchmark',series,eligibleIndexes,safeEnd,wave3Map,championMap,dataSignature});
  if(JSON.stringify(series)!==sourceBefore)return {version:HIGHER_TIMEFRAME_FORWARD_RUNNER_VERSION,status:'blocked',reason:'source-series-mutated'};
  return {version:HIGHER_TIMEFRAME_FORWARD_RUNNER_VERSION,status:'complete',epoch:HIGHER_TIMEFRAME_FORWARD_EPOCH,dataSignature,endIndex:safeEnd,observedBarTimes:eligibleIndexes.map(idx=>Number(series[idx]?.t)).filter(Number.isFinite),decisions:[...candidate.decisions,...benchmark.decisions],evidence:[...candidate.evidence,...benchmark.evidence],methodology:{prospectiveOnly:true,candleOpenTimestampStrictlyAfterFreeze:true,preFreezeBarsContextOnly:true,preFreezePnlForbidden:true,fullyClosedDailyContextOnly:true,partialDailyContextForbidden:true,futureFourHourBarsForbidden:true,fixedHorizonBars:HIGHER_TIMEFRAME_FORWARD_EPOCH.horizonBars,exitMustBeInsideObservedEndIndex:true,independentNonOverlappingPathPerSource:true,matchedChampionBenchmark:true,deterministicEntryBarCost:true,noFitting:true,optimizer:false,parameterSweep:false,selfLearning:false,adaptiveWeights:false,automaticSelection:false,automaticPromotion:false,promotionEligible:false,separateFromKnowledgeForward001:true,separateFromForward001:true,usedByLiveDecisionEngine:false}};
}
