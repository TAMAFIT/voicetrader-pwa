import { HIGHER_TIMEFRAME_ENGINE_VERSION } from '../knowledge/higher-timeframe-engine.js';
import { HIGHER_TIMEFRAME_REGISTRY_VERSION, HIGHER_TIMEFRAME_HORIZON_BARS } from '../knowledge/higher-timeframe-registry.js';
import { RESEARCH_COST_MODEL_VERSION } from './research-cost-model.js';

export const HIGHER_TIMEFRAME_FORWARD_EPOCH_VERSION='higher-timeframe-forward-epoch-0.1';
export const HIGHER_TIMEFRAME_FORWARD_EPOCH_ID='htf-forward-001';
export const HIGHER_TIMEFRAME_FORWARD_FREEZE_ISO='2026-08-17T00:28:00Z';
export const HIGHER_TIMEFRAME_FORWARD_FREEZE_LOCAL='2026-08-17 09:28:00 JST';
export const HIGHER_TIMEFRAME_FORWARD_FREEZE_UNIX=1786926480;
export const HIGHER_TIMEFRAME_FORWARD_IMPLEMENTATION_COMMIT='c8fdedb9b385d1d01f7c69948a2520882388a337';
export const HIGHER_TIMEFRAME_FORWARD_SOURCE_ID='higher-timeframe-wave3-reference';
export const HIGHER_TIMEFRAME_FORWARD_BENCHMARK_ID='champion-001';

export const HIGHER_TIMEFRAME_FORWARD_EPOCH=Object.freeze({
  version:HIGHER_TIMEFRAME_FORWARD_EPOCH_VERSION,
  id:HIGHER_TIMEFRAME_FORWARD_EPOCH_ID,
  frozenAtIso:HIGHER_TIMEFRAME_FORWARD_FREEZE_ISO,
  frozenAtLocal:HIGHER_TIMEFRAME_FORWARD_FREEZE_LOCAL,
  frozenAtUnix:HIGHER_TIMEFRAME_FORWARD_FREEZE_UNIX,
  frozenImplementationCommit:HIGHER_TIMEFRAME_FORWARD_IMPLEMENTATION_COMMIT,
  instrument:'BTCUSD',timeframeHours:4,horizonBars:HIGHER_TIMEFRAME_HORIZON_BARS,
  source:{id:HIGHER_TIMEFRAME_FORWARD_SOURCE_ID,role:'candidate',engineVersion:HIGHER_TIMEFRAME_ENGINE_VERSION,registryVersion:HIGHER_TIMEFRAME_REGISTRY_VERSION},
  benchmark:{id:HIGHER_TIMEFRAME_FORWARD_BENCHMARK_ID,role:'benchmark',engineVersion:'0.4-fixed-experts-policy'},
  researchCostModelVersion:RESEARCH_COST_MODEL_VERSION,
  governance:{
    candleOpenTimestampStrictlyAfterFreeze:true,preFreezeBarsContextOnly:true,preFreezePnlForbidden:true,
    fullyClosedDailyContextOnly:true,partialDailyContextForbidden:true,futureFourHourBarsForbidden:true,
    independentNonOverlappingPathPerSource:true,fixedHorizonBars:HIGHER_TIMEFRAME_HORIZON_BARS,
    noFitting:true,optimizer:false,parameterSweep:false,adaptiveWeights:false,selfLearning:false,automaticSelection:false,automaticPromotion:false,promotionEligible:false,
    separateFromKnowledgeForward001:true,separateFromForward001:true,usedByLiveDecisionEngine:false,
  },
});

export function assertHigherTimeframeForwardEpochRuntime(){
  if(HIGHER_TIMEFRAME_ENGINE_VERSION!=='higher-timeframe-engine-0.1')throw new Error('htf-forward-engine-version-drift');
  if(HIGHER_TIMEFRAME_REGISTRY_VERSION!=='higher-timeframe-registry-0.1')throw new Error('htf-forward-registry-version-drift');
  if(RESEARCH_COST_MODEL_VERSION!=='research-cost-v0.1')throw new Error('htf-forward-cost-version-drift');
  if(HIGHER_TIMEFRAME_HORIZON_BARS!==3)throw new Error('htf-forward-horizon-drift');
  return true;
}
