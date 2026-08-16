import { HumanKnowledgeEngine } from '../knowledge/human-knowledge-engine.js';
import { HumanPlaybookEngine } from '../knowledge/playbook-engine.js';
import { ShadowEngine } from '../engine/shadow-engine.js';
import {
  KNOWLEDGE_CANDIDATE_REGISTRY,
  KNOWLEDGE_CANDIDATE_REGISTRY_VERSION,
  KNOWLEDGE_CANDIDATE_HORIZON_BARS,
  KNOWLEDGE_CANDIDATE_START_INDEX,
  KNOWLEDGE_CANDIDATE_LAGS,
  KNOWLEDGE_CANDIDATE_FOLDS,
  KNOWLEDGE_CANDIDATE_EMBARGO_BARS,
  WAVE1_STRONG_OPPOSITION_THRESHOLD,
} from './knowledge-candidate-registry.js';
import { summarizePlaybookTrades } from './playbook-shadow-runner.js';

export const KNOWLEDGE_CANDIDATE_TOURNAMENT_VERSION = 'knowledge-candidate-tournament-0.1';

const round = (value, digits = 2) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

const finite = values => values.map(Number).filter(Number.isFinite);

function quantile(values, q) {
  const sorted = finite(values).sort((a,b) => a-b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return round(sorted[0]);
  const position = Math.max(0,Math.min(sorted.length - 1,(sorted.length - 1) * q));
  const lo = Math.floor(position), hi = Math.ceil(position), w = position - lo;
  return round(sorted[lo] * (1-w) + sorted[hi] * w);
}

function sideFromDecision(decision) {
  if (decision === 'ENTER_LONG') return 'LONG';
  if (decision === 'ENTER_SHORT') return 'SHORT';
  return null;
}

function outcomeBps(series, entryIndex, exitIndex, side, costBps) {
  const entryPrice = Number(series[entryIndex]?.c);
  const exitPrice = Number(series[exitIndex]?.c);
  if (!(entryPrice > 0) || !(exitPrice > 0)) return null;
  const gross = side === 'LONG'
    ? (exitPrice / entryPrice - 1) * 10000
    : ((entryPrice - exitPrice) / entryPrice) * 10000;
  return {
    entryPrice,
    exitPrice,
    grossReturnBps:round(gross),
    netReturnBps:round(gross - Math.max(0,Number(costBps) || 0)),
  };
}

export function buildCandidateDecision(candidateId, wave1, wave2) {
  if (candidateId === 'candidate-wave1-reference') return wave1.entryDecision;
  if (candidateId === 'candidate-playbook-reference') return wave2.entryDecision;
  if (candidateId === 'candidate-consensus') {
    if (wave1.entryDecision !== 'NO_ENTRY' && wave1.entryDecision === wave2.entryDecision) return wave1.entryDecision;
    return 'NO_ENTRY';
  }
  if (candidateId === 'candidate-playbook-wave1-veto') {
    const playbookDecision = wave2.entryDecision;
    if (playbookDecision === 'NO_ENTRY') return 'NO_ENTRY';
    const wave1Score = Number(wave1.knowledgeScore || 0);
    const opposing = playbookDecision === 'ENTER_LONG'
      ? wave1Score <= -WAVE1_STRONG_OPPOSITION_THRESHOLD
      : wave1Score >= WAVE1_STRONG_OPPOSITION_THRESHOLD;
    return opposing ? 'NO_ENTRY' : playbookDecision;
  }
  return 'NO_ENTRY';
}

function buildObservations(series, startIndex, endIndex, maxLag) {
  const wave1Engine = new HumanKnowledgeEngine();
  const wave2Engine = new HumanPlaybookEngine();
  const championEngine = new ShadowEngine({ seriesProvider:() => series });
  const observations = new Map();
  const from = Math.max(55,startIndex - maxLag);
  for (let idx = from; idx <= endIndex; idx++) {
    const wave1 = wave1Engine.analyze(series,idx);
    const wave2 = wave2Engine.analyze(series,idx);
    if (wave1.status !== 'complete' || wave2.status !== 'complete') continue;
    const champion = championEngine.analyze('BTCUSD',idx);
    const candidateDecisions = Object.fromEntries(KNOWLEDGE_CANDIDATE_REGISTRY.candidates.map(candidate => [candidate.id,buildCandidateDecision(candidate.id,wave1,wave2)]));
    observations.set(idx,{
      idx,
      wave1,
      wave2,
      championDecision:champion.entryDecision,
      candidateDecisions,
      regime:wave1.context?.regime || 'unknown',
      riskGate:wave1.context?.riskGate || 'unknown',
    });
  }
  return observations;
}

function simulate({ series,observations,startIndex,endIndex,horizonBars,costBps,sourceId,lagBars=0,requireExitWithinEnd=true }) {
  const trades = [];
  const decisionCounts = { ENTER_LONG:0,ENTER_SHORT:0,NO_ENTRY:0 };
  let nextFree = startIndex;
  for (let idx = startIndex; idx + horizonBars <= endIndex; idx++) {
    if (idx < nextFree) continue;
    const current = observations.get(idx);
    const signalObservation = observations.get(idx - Math.max(0,Number(lagBars) || 0));
    if (!current || !signalObservation) continue;
    const decision = sourceId === 'champion-001'
      ? signalObservation.championDecision
      : signalObservation.candidateDecisions[sourceId];
    if (!decision) continue;
    decisionCounts[decision] = (decisionCounts[decision] || 0) + 1;
    const side = sideFromDecision(decision);
    if (!side) continue;
    const exitIndex = idx + horizonBars;
    if (requireExitWithinEnd && exitIndex > endIndex) continue;
    const outcome = outcomeBps(series,idx,exitIndex,side,costBps);
    if (!outcome) continue;
    trades.push({
      sourceId,
      signalLagBars:Math.max(0,Number(lagBars) || 0),
      entryIndex:idx,
      exitIndex,
      entryTime:Number(series[idx]?.t) || null,
      exitTime:Number(series[exitIndex]?.t) || null,
      side,
      regime:current.regime,
      riskGate:current.riskGate,
      ...outcome,
    });
    nextFree = exitIndex + 1;
  }
  return {
    decisionCounts,
    trades,
    summary:summarizePlaybookTrades(trades,startIndex,endIndex,horizonBars),
  };
}

function nullStats(replicates, realAvg) {
  const values = replicates.map(item => item.avgNetBps);
  const clean = finite(values);
  const median = quantile(clean,.5), p95 = quantile(clean,.95);
  const exceedance = clean.length ? clean.filter(value => value >= Number(realAvg || 0)).length / clean.length * 100 : null;
  return {
    medianAvgNetBps:median,
    p95AvgNetBps:p95,
    maxAvgNetBps:clean.length ? round(Math.max(...clean)) : null,
    exceedanceRatePct:round(exceedance,1),
    finiteReplicates:clean.length,
    screening:Number.isFinite(Number(p95)) && Number(realAvg || 0) > Number(p95) ? 'above-null95' : 'null-overlap',
  };
}

export function buildCandidateTournamentWindows(startIndex,endIndex,folds=KNOWLEDGE_CANDIDATE_FOLDS,embargoBars=KNOWLEDGE_CANDIDATE_EMBARGO_BARS) {
  const start = Math.max(0,Number(startIndex) || 0);
  const end = Math.max(start,Number(endIndex) || start);
  const usable = end - start + 1 - Math.max(0,folds - 1) * embargoBars;
  if (usable < folds * 12) return [];
  const baseSize = Math.floor(usable / folds);
  const windows = [];
  let cursor = start;
  for (let fold = 1; fold <= folds; fold++) {
    const foldEnd = fold === folds ? end : Math.min(end,cursor + baseSize - 1);
    windows.push({ fold,startIndex:cursor,endIndex:foldEnd,embargoBeforeBars:fold === 1 ? 0 : embargoBars });
    cursor = foldEnd + 1 + (fold < folds ? embargoBars : 0);
  }
  return windows;
}

function holdoutForSource({ series,observations,windows,horizonBars,costBps,sourceId }) {
  const folds = windows.map(window => {
    const result = simulate({ series,observations,startIndex:window.startIndex,endIndex:window.endIndex,horizonBars,costBps,sourceId });
    return { ...window,summary:result.summary };
  });
  const foldReturns = folds.map(item => Number(item.summary.returnPct || 0));
  const foldAvg = folds.map(item => Number(item.summary.avgNetBps || 0));
  return {
    folds,
    positiveFolds:foldReturns.filter(value => value > 0).length,
    negativeFolds:foldReturns.filter(value => value < 0).length,
    flatFolds:foldReturns.filter(value => value === 0).length,
    avgFoldReturnPct:round(foldReturns.reduce((sum,value) => sum + value,0) / Math.max(1,foldReturns.length)),
    avgFoldNetBps:round(foldAvg.reduce((sum,value) => sum + value,0) / Math.max(1,foldAvg.length)),
  };
}

function candidateDiagnostic(full,nullControl,holdout,benchmark) {
  const avg = Number(full.avgNetBps || 0);
  const benchmarkAvg = Number(benchmark.avgNetBps || 0);
  const aboveNull = nullControl.screening === 'above-null95';
  const positiveHoldout = holdout.positiveFolds >= 2;
  return {
    beatsBenchmarkSameSeries:avg > benchmarkAvg,
    aboveLagNull95:aboveNull,
    majorityPositiveHoldoutFolds:positiveHoldout,
    preliminaryScreenCount:[avg > benchmarkAvg,aboveNull,positiveHoldout].filter(Boolean).length,
    promotionEligible:false,
    reason:'prospective-evidence-required',
  };
}

export function runKnowledgeCandidateTournament({
  series,
  endIndex,
  estimatedRoundTripCostBps=0,
  dataSignature='unknown',
  startIndex=KNOWLEDGE_CANDIDATE_START_INDEX,
  horizonBars=KNOWLEDGE_CANDIDATE_HORIZON_BARS,
} = {}) {
  const maxLag = Math.max(...KNOWLEDGE_CANDIDATE_LAGS);
  if (!Array.isArray(series) || series.length <= startIndex + maxLag + horizonBars + 30) {
    return { version:KNOWLEDGE_CANDIDATE_TOURNAMENT_VERSION,status:'unavailable',reason:'insufficient-series' };
  }
  const sourceBefore = JSON.stringify(series);
  const safeEnd = Math.min(Number(endIndex ?? series.length - 1),series.length - 1);
  const observations = buildObservations(series,startIndex,safeEnd,maxLag);
  if (!observations.size) return { version:KNOWLEDGE_CANDIDATE_TOURNAMENT_VERSION,status:'unavailable',reason:'no-complete-observations' };

  const benchmarkRun = simulate({ series,observations,startIndex,endIndex:safeEnd,horizonBars,costBps:estimatedRoundTripCostBps,sourceId:'champion-001' });
  const candidateRuns = KNOWLEDGE_CANDIDATE_REGISTRY.candidates.map(candidate => {
    const full = simulate({ series,observations,startIndex,endIndex:safeEnd,horizonBars,costBps:estimatedRoundTripCostBps,sourceId:candidate.id });
    const nullStart = startIndex + maxLag;
    const nullReference = simulate({ series,observations,startIndex:nullStart,endIndex:safeEnd,horizonBars,costBps:estimatedRoundTripCostBps,sourceId:candidate.id });
    const replicates = KNOWLEDGE_CANDIDATE_LAGS.map(lagBars => {
      const lagged = simulate({ series,observations,startIndex:nullStart,endIndex:safeEnd,horizonBars,costBps:estimatedRoundTripCostBps,sourceId:candidate.id,lagBars });
      return { lagBars,trades:lagged.summary.trades,returnPct:lagged.summary.returnPct,avgNetBps:lagged.summary.avgNetBps,profitFactor:lagged.summary.profitFactor };
    });
    const nullControl = {
      method:'candidate-decision-past-signal-lag',
      referenceSummary:nullReference.summary,
      replicates,
      ...nullStats(replicates,nullReference.summary.avgNetBps),
    };
    return { candidate,fullRun:full,nullControl };
  });

  const windows = buildCandidateTournamentWindows(startIndex,safeEnd);
  if (windows.length !== KNOWLEDGE_CANDIDATE_FOLDS) return { version:KNOWLEDGE_CANDIDATE_TOURNAMENT_VERSION,status:'unavailable',reason:'insufficient-holdout-window' };
  const benchmarkHoldout = holdoutForSource({ series,observations,windows,horizonBars,costBps:estimatedRoundTripCostBps,sourceId:'champion-001' });
  const results = candidateRuns.map(item => {
    const holdout = holdoutForSource({ series,observations,windows,horizonBars,costBps:estimatedRoundTripCostBps,sourceId:item.candidate.id });
    return {
      id:item.candidate.id,
      label:item.candidate.label,
      hypothesis:item.candidate.hypothesis,
      rule:item.candidate.rule,
      summary:item.fullRun.summary,
      decisionCounts:item.fullRun.decisionCounts,
      nullControl:item.nullControl,
      holdout,
      deltaVsChampion:{
        returnPct:round(Number(item.fullRun.summary.returnPct || 0) - Number(benchmarkRun.summary.returnPct || 0)),
        avgNetBps:round(Number(item.fullRun.summary.avgNetBps || 0) - Number(benchmarkRun.summary.avgNetBps || 0)),
        trades:Number(item.fullRun.summary.trades || 0) - Number(benchmarkRun.summary.trades || 0),
      },
      diagnostic:candidateDiagnostic(item.fullRun.summary,item.nullControl,holdout,benchmarkRun.summary),
    };
  });

  const displayRanking = results.slice().sort((a,b) => Number(b.summary.avgNetBps || 0) - Number(a.summary.avgNetBps || 0)).map((item,index) => ({ rank:index+1,id:item.id,label:item.label,avgNetBps:item.summary.avgNetBps,returnPct:item.summary.returnPct }));

  if (JSON.stringify(series) !== sourceBefore) return { version:KNOWLEDGE_CANDIDATE_TOURNAMENT_VERSION,status:'blocked',reason:'source-series-mutated' };

  return {
    version:KNOWLEDGE_CANDIDATE_TOURNAMENT_VERSION,
    registryVersion:KNOWLEDGE_CANDIDATE_REGISTRY_VERSION,
    status:'complete',
    dataSignature,
    startIndex,
    endIndex:safeEnd,
    horizonBars,
    estimatedRoundTripCostBps:round(estimatedRoundTripCostBps),
    benchmark:{ id:'champion-001',label:'Frozen Champion 001',summary:benchmarkRun.summary,decisionCounts:benchmarkRun.decisionCounts,holdout:benchmarkHoldout },
    results,
    displayRanking,
    holdoutWindows:windows,
    promotionProtocol:{
      prospectiveEvidenceRequired:true,
      pristineFutureEpochRequired:true,
      negativeControlReviewRequired:true,
      chronologicalDiagnosticRequired:true,
      executionCostReviewRequired:true,
      humanReviewRequired:true,
      automaticPromotion:false,
      currentlyPromotionEligible:false,
    },
    methodology:{
      purpose:'bounded-research-only-knowledge-candidate-tournament',
      fixedCandidateCount:4,
      generatedCombinations:false,
      combinatorialSearch:false,
      fixedHorizonBars:horizonBars,
      nonOverlappingTrades:true,
      sameMarketAndCostForAll:true,
      lagControlsUsePastDecisionsOnly:true,
      formalPValue:false,
      chronologicalFolds:KNOWLEDGE_CANDIDATE_FOLDS,
      embargoBars:KNOWLEDGE_CANDIDATE_EMBARGO_BARS,
      noFittingPerformed:true,
      pristineUntouchedOOS:false,
      historicalSeriesAlreadyInspected:true,
      rawScoreMinusCost:false,
      costAppliedToRealizedTradeReturnsOnly:true,
      automaticSelection:false,
      optimizer:false,
      parameterSweep:false,
      selfLearning:false,
      adaptiveWeights:false,
      automaticPromotion:false,
      championMutation:false,
      usedByLiveDecisionEngine:false,
      usedByForwardEvidence:false,
    },
  };
}
