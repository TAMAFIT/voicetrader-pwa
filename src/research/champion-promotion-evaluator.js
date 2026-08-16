import { KNOWLEDGE_CANDIDATE_HORIZON_BARS } from './knowledge-candidate-registry.js';
import { KNOWLEDGE_FORWARD_EPOCH_ID, KNOWLEDGE_FORWARD_FREEZE_UNIX } from './knowledge-forward-epoch.js';
import { detectKnowledgeForwardBarGaps } from './knowledge-forward-runner.js';
import { estimateResearchRoundTripCostBps, RESEARCH_COST_MODEL_VERSION } from './research-cost-model.js';
import {
  FOUR_HOURS_SECONDS,
  FROZEN_KNOWLEDGE_EVALUATOR_COMMIT,
  normalizeKnowledgeForwardRemoteDocument,
} from './knowledge-forward-remote.js';
import {
  CHAMPION_PROMOTION_BENCHMARK_ID,
  CHAMPION_PROMOTION_CANDIDATE_IDS,
  CHAMPION_PROMOTION_LAG_CONTROLS,
  CHAMPION_PROMOTION_PROTOCOL,
  CHAMPION_PROMOTION_PROTOCOL_VERSION,
  CHAMPION_PROMOTION_STAGE_A,
  assertChampionPromotionProtocol,
} from './champion-promotion-protocol.js';

export const CHAMPION_PROMOTION_EVALUATOR_VERSION = 'champion-promotion-evaluator-0.1';

const round = (value,digits=2) => {
  const n=Number(value);
  if(!Number.isFinite(n)) return null;
  const scale=10**digits;
  return Math.round(n*scale)/scale;
};
const finite = values => values.map(Number).filter(Number.isFinite);
const sideFromDecision = decision => decision==='ENTER_LONG'?'LONG':decision==='ENTER_SHORT'?'SHORT':null;

function stableValue(value){
  if(Array.isArray(value)) return value.map(stableValue);
  if(value&&typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
  return value;
}
function stableString(value){return JSON.stringify(stableValue(value));}

function quantile(values,q){
  const sorted=finite(values).sort((a,b)=>a-b);
  if(!sorted.length)return null;
  if(sorted.length===1)return round(sorted[0]);
  const pos=Math.max(0,Math.min(sorted.length-1,(sorted.length-1)*q));
  const lo=Math.floor(pos),hi=Math.ceil(pos),w=pos-lo;
  return round(sorted[lo]*(1-w)+sorted[hi]*w);
}

export function summarizePromotionEvidence(items=[]){
  const sorted=[...items].sort((a,b)=>Number(a.entryTime)-Number(b.entryTime));
  let equity=1,peak=1,maxDrawdown=0,wins=0,grossProfit=0,grossLoss=0;
  for(const trade of sorted){
    const net=Number(trade?.netReturnBps);
    if(!Number.isFinite(net))continue;
    if(net>0){wins++;grossProfit+=net;}
    if(net<0)grossLoss+=Math.abs(net);
    equity*=Math.max(.000001,1+net/10000);
    peak=Math.max(peak,equity);
    maxDrawdown=Math.max(maxDrawdown,peak>0?(peak-equity)/peak:0);
  }
  const valid=sorted.filter(item=>Number.isFinite(Number(item?.netReturnBps)));
  return {
    trades:valid.length,
    returnPct:round((equity-1)*100),
    avgNetBps:valid.length?round(valid.reduce((sum,item)=>sum+Number(item.netReturnBps),0)/valid.length):0,
    winRatePct:valid.length?round(wins/valid.length*100,1):0,
    profitFactor:grossLoss>0?round(grossProfit/grossLoss):grossProfit>0?null:null,
    maxDrawdownPct:round(maxDrawdown*100),
    firstEntryTime:valid.length?Number(valid[0].entryTime):null,
    lastExitTime:valid.length?Math.max(...valid.map(item=>Number(item.exitTime)||0)):null,
  };
}

function outcomeBps(series,entryIndex,exitIndex,side,costBps){
  const entry=Number(series[entryIndex]?.c),exit=Number(series[exitIndex]?.c);
  if(!(entry>0)||!(exit>0))return null;
  const gross=side==='LONG'?(exit/entry-1)*10000:((entry-exit)/entry)*10000;
  return {grossReturnBps:round(gross),netReturnBps:round(gross-Math.max(0,Number(costBps)||0))};
}

function duplicateKeyDiagnostics(items,keyName){
  const seen=new Map(),duplicates=[];
  for(const item of items||[]){
    const key=item?.[keyName];
    if(!key)continue;
    const encoded=stableString(item);
    if(!seen.has(key)){seen.set(key,encoded);continue;}
    duplicates.push({key,conflicting:seen.get(key)!==encoded});
  }
  return {duplicateCount:duplicates.length,conflictingDuplicateCount:duplicates.filter(item=>item.conflicting).length,duplicates};
}

export function inspectChampionPromotionIntegrity(remoteDocument){
  const raw=remoteDocument||{};
  const archive=raw.evidenceArchive||{};
  const marketBars=Array.isArray(raw.market?.bars)?raw.market.bars:[];
  const observed=Array.isArray(archive.observedBarTimes)?archive.observedBarTimes:[];
  const decisionKeys=duplicateKeyDiagnostics(archive.decisions,'decisionKey');
  const evidenceKeys=duplicateKeyDiagnostics(archive.evidence,'evidenceKey');
  const observedContinuity=detectKnowledgeForwardBarGaps(observed);
  const expectedSources=new Set([CHAMPION_PROMOTION_BENCHMARK_ID,...CHAMPION_PROMOTION_CANDIDATE_IDS]);
  const unknownDecisionSources=[...new Set((archive.decisions||[]).map(item=>item?.sourceId).filter(id=>id&&!expectedSources.has(id)))];
  const unknownEvidenceSources=[...new Set((archive.evidence||[]).map(item=>item?.sourceId).filter(id=>id&&!expectedSources.has(id)))];
  const invalidEvidence=(archive.evidence||[]).filter(item=>{
    const entry=Number(item?.entryTime),exit=Number(item?.exitTime);
    return !(entry>KNOWLEDGE_FORWARD_FREEZE_UNIX)||!(exit>KNOWLEDGE_FORWARD_FREEZE_UNIX)||!(exit>entry)||item?.costModelVersion!==RESEARCH_COST_MODEL_VERSION;
  });
  const reasons=[];
  if(raw.epochId!==KNOWLEDGE_FORWARD_EPOCH_ID)reasons.push('epoch-mismatch');
  if(raw.frozenEvaluatorCommit!==FROZEN_KNOWLEDGE_EVALUATOR_COMMIT)reasons.push('frozen-evaluator-mismatch');
  if(archive.epochId!==KNOWLEDGE_FORWARD_EPOCH_ID)reasons.push('evidence-archive-epoch-mismatch');
  if(!raw.collector?.lastRunAt)reasons.push('no-autonomous-collector-run');
  if(raw.collector?.status!=='success')reasons.push(`collector-status-${raw.collector?.status||'missing'}`);
  if((raw.collector?.marketConflicts||[]).length)reasons.push('market-conflicts-present');
  if(Number(raw.market?.continuity?.gapCount||0)!==0)reasons.push('market-continuity-gap');
  if(observedContinuity.gapCount!==0)reasons.push('observed-prospective-gap');
  if(decisionKeys.duplicateCount)reasons.push('duplicate-decision-key');
  if(evidenceKeys.duplicateCount)reasons.push('duplicate-evidence-key');
  if(unknownDecisionSources.length||unknownEvidenceSources.length)reasons.push('unknown-source-id');
  if(invalidEvidence.length)reasons.push('invalid-prospective-evidence');
  if(!marketBars.length)reasons.push('missing-market-archive');
  return {
    clean:reasons.length===0,
    reasons,
    marketBars:marketBars.length,
    observedBars:observed.length,
    marketGapCount:Number(raw.market?.continuity?.gapCount||0),
    observedGapCount:observedContinuity.gapCount,
    decisionKeys,
    evidenceKeys,
    unknownDecisionSources,
    unknownEvidenceSources,
    invalidEvidenceCount:invalidEvidence.length,
    autonomousCollectorObserved:Boolean(raw.collector?.lastRunAt),
  };
}

function buildTimeIndex(series=[]){return new Map(series.map((bar,index)=>[Number(bar?.t),index]).filter(([time])=>Number.isFinite(time)));}
function buildDecisionIndex(decisions=[],sourceId){
  return new Map(decisions.filter(item=>item?.sourceId===sourceId&&Number.isFinite(Number(item.candleTime))).map(item=>[Number(item.candleTime),item]));
}

export function buildProspectiveLagControls({remoteDocument,sourceId}={}){
  assertChampionPromotionProtocol();
  const normalized=normalizeKnowledgeForwardRemoteDocument(remoteDocument);
  const series=normalized.market.bars||[];
  const archive=normalized.evidenceArchive||{};
  const observedTimes=[...new Set((archive.observedBarTimes||[]).map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);
  const observedSet=new Set(observedTimes);
  const indexByTime=buildTimeIndex(series);
  const decisions=buildDecisionIndex(archive.decisions,sourceId);
  const realEvidence=(archive.evidence||[]).filter(item=>item?.sourceId===sourceId);
  const realSummary=summarizePromotionEvidence(realEvidence);
  const replicates=CHAMPION_PROMOTION_LAG_CONTROLS.map(lagBars=>{
    const trades=[];
    let nextFreeTime=-Infinity;
    for(const entryTime of observedTimes){
      if(entryTime<nextFreeTime)continue;
      const signalTime=entryTime-lagBars*FOUR_HOURS_SECONDS;
      const signal=decisions.get(signalTime);
      const side=sideFromDecision(signal?.decision);
      if(!side)continue;
      const entryIndex=indexByTime.get(entryTime);
      if(!Number.isInteger(entryIndex))continue;
      const exitIndex=entryIndex+KNOWLEDGE_CANDIDATE_HORIZON_BARS;
      const exitTime=Number(series[exitIndex]?.t);
      if(!Number.isFinite(exitTime)||!observedSet.has(exitTime))continue;
      if(!(signalTime<entryTime)||!(entryTime>KNOWLEDGE_FORWARD_FREEZE_UNIX)||!(exitTime>entryTime))continue;
      const costBps=estimateResearchRoundTripCostBps(series,entryIndex,'BTCUSD');
      if(!Number.isFinite(Number(costBps)))continue;
      const outcome=outcomeBps(series,entryIndex,exitIndex,side,costBps);
      if(!outcome)continue;
      trades.push({
        sourceId,
        lagBars,
        signalTime,
        entryTime,
        exitTime,
        side,
        estimatedRoundTripCostBps:round(costBps,4),
        costModelVersion:RESEARCH_COST_MODEL_VERSION,
        futureDecisionUsed:false,
        ...outcome,
      });
      nextFreeTime=exitTime+FOUR_HOURS_SECONDS;
    }
    const summary=summarizePromotionEvidence(trades);
    return {lagBars,summary,trades};
  });
  const eligible=replicates.filter(item=>item.summary.trades>=CHAMPION_PROMOTION_STAGE_A.minTradesPerLagReplicate);
  const values=eligible.map(item=>item.summary.avgNetBps);
  const p95=quantile(values,.95);
  return {
    method:'prospective-past-decision-lag',
    sourceId,
    lags:[...CHAMPION_PROMOTION_LAG_CONTROLS],
    realSummary,
    replicates,
    eligibleReplicates:eligible.length,
    requiredFiniteLagReplicates:CHAMPION_PROMOTION_STAGE_A.requiredFiniteLagReplicates,
    minTradesPerLagReplicate:CHAMPION_PROMOTION_STAGE_A.minTradesPerLagReplicate,
    medianAvgNetBps:quantile(values,.5),
    p95AvgNetBps:p95,
    maxAvgNetBps:values.length?round(Math.max(...values)):null,
    exceedanceRatePct:values.length?round(values.filter(value=>value>=Number(realSummary.avgNetBps||0)).length/values.length*100,1):null,
    screening:eligible.length===CHAMPION_PROMOTION_STAGE_A.requiredFiniteLagReplicates&&Number.isFinite(Number(p95))&&Number(realSummary.avgNetBps)>Number(p95)?'above-null95':'not-above-null95',
    formalPValue:false,
    modelRecomputation:false,
    archivedPastDecisionsOnly:true,
    futureDecisionUsed:false,
  };
}

export function buildProspectivePromotionFolds(remoteDocument,foldCount=CHAMPION_PROMOTION_STAGE_A.chronologicalFolds){
  const normalized=normalizeKnowledgeForwardRemoteDocument(remoteDocument);
  const observed=[...new Set((normalized.evidenceArchive.observedBarTimes||[]).map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);
  if(observed.length<foldCount)return [];
  const base=Math.floor(observed.length/foldCount);
  const folds=[];
  let cursor=0;
  for(let fold=1;fold<=foldCount;fold++){
    const endExclusive=fold===foldCount?observed.length:cursor+base;
    const slice=observed.slice(cursor,endExclusive);
    if(!slice.length)return [];
    folds.push({fold,startTime:slice[0],endTime:slice.at(-1),observedBars:slice.length});
    cursor=endExclusive;
  }
  return folds;
}

function foldEvaluation(remoteDocument,sourceId){
  const normalized=normalizeKnowledgeForwardRemoteDocument(remoteDocument);
  const evidence=normalized.evidenceArchive.evidence||[];
  const folds=buildProspectivePromotionFolds(normalized);
  const results=folds.map(fold=>{
    const candidate=evidence.filter(item=>item.sourceId===sourceId&&Number(item.entryTime)>=fold.startTime&&Number(item.exitTime)<=fold.endTime);
    const benchmark=evidence.filter(item=>item.sourceId===CHAMPION_PROMOTION_BENCHMARK_ID&&Number(item.entryTime)>=fold.startTime&&Number(item.exitTime)<=fold.endTime);
    const candidateSummary=summarizePromotionEvidence(candidate);
    const benchmarkSummary=summarizePromotionEvidence(benchmark);
    return {
      ...fold,
      candidate:candidateSummary,
      benchmark:benchmarkSummary,
      enoughTrades:candidateSummary.trades>=CHAMPION_PROMOTION_STAGE_A.minTradesPerFoldPerSource&&benchmarkSummary.trades>=CHAMPION_PROMOTION_STAGE_A.minTradesPerFoldPerSource,
      candidatePositive:candidateSummary.returnPct>0,
      beatsBenchmarkAvgNetBps:candidateSummary.avgNetBps>benchmarkSummary.avgNetBps,
    };
  });
  return {
    folds:results,
    sufficientTradeFolds:results.filter(item=>item.enoughTrades).length,
    positiveCandidateFolds:results.filter(item=>item.enoughTrades&&item.candidatePositive).length,
    benchmarkBeatFolds:results.filter(item=>item.enoughTrades&&item.beatsBenchmarkAvgNetBps).length,
  };
}

function elapsedCalendarDays(remoteDocument){
  const observed=(remoteDocument?.evidenceArchive?.observedBarTimes||[]).map(Number).filter(Number.isFinite);
  if(!observed.length)return 0;
  const latestOpen=Math.max(...observed);
  const latestClosedBoundary=latestOpen+FOUR_HOURS_SECONDS;
  return Math.max(0,(latestClosedBoundary-KNOWLEDGE_FORWARD_FREEZE_UNIX)/86400);
}

function addBlocker(blockers,condition,code){if(!condition)blockers.push(code);}

export function evaluateChampionPromotionQualification(remoteDocument){
  assertChampionPromotionProtocol();
  if(RESEARCH_COST_MODEL_VERSION!=='research-cost-v0.1')return {version:CHAMPION_PROMOTION_EVALUATOR_VERSION,status:'blocked',reason:'research-cost-model-version-drift'};
  if(!remoteDocument)return {version:CHAMPION_PROMOTION_EVALUATOR_VERSION,status:'unavailable',reason:'missing-remote-archive'};
  const raw=remoteDocument;
  const normalized=normalizeKnowledgeForwardRemoteDocument(raw);
  const integrity=inspectChampionPromotionIntegrity(raw);
  const archive=normalized.evidenceArchive;
  const evidence=archive.evidence||[];
  const benchmarkSummary=summarizePromotionEvidence(evidence.filter(item=>item.sourceId===CHAMPION_PROMOTION_BENCHMARK_ID));
  const elapsedDays=elapsedCalendarDays(normalized);
  const observedBars=(archive.observedBarTimes||[]).length;
  const candidates=CHAMPION_PROMOTION_CANDIDATE_IDS.map(sourceId=>{
    const summary=summarizePromotionEvidence(evidence.filter(item=>item.sourceId===sourceId));
    const folds=foldEvaluation(normalized,sourceId);
    const lagControl=buildProspectiveLagControls({remoteDocument:normalized,sourceId});
    const blockers=[];
    addBlocker(blockers,integrity.clean,'archive-integrity-not-clean');
    addBlocker(blockers,elapsedDays>=CHAMPION_PROMOTION_STAGE_A.minElapsedCalendarDays,'elapsed-days-below-minimum');
    addBlocker(blockers,observedBars>=CHAMPION_PROMOTION_STAGE_A.minObservedBars,'observed-bars-below-minimum');
    addBlocker(blockers,summary.trades>=CHAMPION_PROMOTION_STAGE_A.minCandidateTrades,'candidate-trades-below-minimum');
    addBlocker(blockers,benchmarkSummary.trades>=CHAMPION_PROMOTION_STAGE_A.minBenchmarkTrades,'benchmark-trades-below-minimum');
    addBlocker(blockers,summary.returnPct>0,'candidate-return-not-positive');
    addBlocker(blockers,summary.avgNetBps>0,'candidate-avg-net-not-positive');
    addBlocker(blockers,summary.avgNetBps>benchmarkSummary.avgNetBps,'candidate-does-not-beat-champion-avg-net');
    addBlocker(blockers,folds.sufficientTradeFolds===CHAMPION_PROMOTION_STAGE_A.chronologicalFolds,'prospective-fold-trades-insufficient');
    addBlocker(blockers,folds.positiveCandidateFolds>=CHAMPION_PROMOTION_STAGE_A.minPositiveCandidateFolds,'positive-fold-count-below-minimum');
    addBlocker(blockers,folds.benchmarkBeatFolds>=CHAMPION_PROMOTION_STAGE_A.minBenchmarkBeatFolds,'benchmark-beat-fold-count-below-minimum');
    addBlocker(blockers,lagControl.eligibleReplicates===CHAMPION_PROMOTION_STAGE_A.requiredFiniteLagReplicates,'lag-control-replicates-insufficient');
    addBlocker(blockers,lagControl.screening==='above-null95','candidate-not-above-lag-null95');
    return {
      sourceId,
      summary,
      deltaVsChampion:{avgNetBps:round(summary.avgNetBps-benchmarkSummary.avgNetBps),returnPct:round(summary.returnPct-benchmarkSummary.returnPct),trades:summary.trades-benchmarkSummary.trades},
      folds,
      lagControl,
      blockers,
      confirmationReviewReady:blockers.length===0,
      promotionEligible:false,
      directPromotionForbidden:true,
    };
  });
  const readyCandidateIds=candidates.filter(item=>item.confirmationReviewReady).map(item=>item.sourceId);
  return {
    version:CHAMPION_PROMOTION_EVALUATOR_VERSION,
    protocolVersion:CHAMPION_PROMOTION_PROTOCOL_VERSION,
    status:'complete',
    evaluatedAt:new Date().toISOString(),
    qualificationEpochId:KNOWLEDGE_FORWARD_EPOCH_ID,
    benchmarkId:CHAMPION_PROMOTION_BENCHMARK_ID,
    frozenEvaluatorCommit:FROZEN_KNOWLEDGE_EVALUATOR_COMMIT,
    costModelVersion:RESEARCH_COST_MODEL_VERSION,
    elapsedCalendarDays:round(elapsedDays,2),
    observedBars,
    integrity,
    benchmarkSummary,
    candidates,
    readyCandidateIds,
    anyConfirmationReviewReady:readyCandidateIds.length>0,
    stageAResult:readyCandidateIds.length?'human-confirmation-nomination-review-required':'not-ready',
    promotionEligible:false,
    selectedCandidateId:null,
    automaticNomination:false,
    automaticPromotion:false,
    championMutation:false,
    confirmationProtocol:CHAMPION_PROMOTION_PROTOCOL.stageB,
    methodology:{
      qualificationOnly:true,
      directChampion002PromotionForbidden:true,
      qualificationDataCannotBeConfirmationData:true,
      prospectiveArchivedEvidenceOnly:true,
      lagControlsUseArchivedPastDecisionsOnly:true,
      lagControls:[...CHAMPION_PROMOTION_LAG_CONTROLS],
      lagNull95IsScreeningNotFormalPValue:true,
      chronologicalProspectiveFolds:CHAMPION_PROMOTION_STAGE_A.chronologicalFolds,
      noFitting:true,
      thresholdSearch:false,
      optimizer:false,
      parameterSweep:false,
      selfLearning:false,
      adaptiveWeights:false,
      usedByLiveDecisionEngine:false,
      usedByKnowledgeForwardDecisionEngine:false,
    },
  };
}
