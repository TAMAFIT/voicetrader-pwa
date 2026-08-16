import { HumanPlaybookEngine } from '../knowledge/playbook-engine.js';
import { runKnowledgeShadow } from './knowledge-shadow-runner.js';
import { PLAYBOOK_SHADOW_HORIZON_BARS, PLAYBOOK_SHADOW_START_INDEX, playbookOutcomeBps, playbookSideFromDecision, summarizePlaybookTrades } from './playbook-shadow-runner.js';

export const PLAYBOOK_WALK_FORWARD_VERSION = 'playbook-walk-forward-0.1';
export const PLAYBOOK_WALK_FORWARD_FOLDS = 3;
export const PLAYBOOK_WALK_FORWARD_EMBARGO_BARS = 3;

const round = (value, digits = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

export function buildPlaybookWalkForwardWindows(startIndex, endIndex, folds = PLAYBOOK_WALK_FORWARD_FOLDS, embargoBars = PLAYBOOK_WALK_FORWARD_EMBARGO_BARS) {
  const start = Math.max(0, Number(startIndex) || 0);
  const end = Math.max(start, Number(endIndex) || start);
  const usable = (end - start + 1) - Math.max(0, folds - 1) * embargoBars;
  if (usable < folds * 12) return [];
  const baseSize = Math.floor(usable / folds);
  const windows = [];
  let cursor = start;
  for (let fold = 1; fold <= folds; fold++) {
    const remainingFolds = folds - fold;
    const foldEnd = fold === folds ? end : Math.min(end, cursor + baseSize - 1);
    windows.push({ fold,startIndex:cursor,endIndex:foldEnd,embargoBeforeBars:fold === 1 ? 0 : embargoBars });
    cursor = foldEnd + 1 + (remainingFolds >= 0 && fold < folds ? embargoBars : 0);
  }
  return windows;
}

function runFold({ series, startIndex, endIndex, horizonBars, costBps }) {
  const engine = new HumanPlaybookEngine();
  const trades = [];
  const decisions = { ENTER_LONG:0,ENTER_SHORT:0,NO_ENTRY:0 };
  let nextFree = startIndex;
  for (let idx = startIndex; idx + horizonBars <= endIndex; idx++) {
    if (idx < nextFree) continue;
    const analysis = engine.analyze(series,idx);
    if (analysis.status !== 'complete') continue;
    decisions[analysis.entryDecision] = (decisions[analysis.entryDecision] || 0) + 1;
    const side = playbookSideFromDecision(analysis.entryDecision);
    if (!side) continue;
    const exitIndex = idx + horizonBars;
    if (exitIndex > endIndex) continue;
    const outcome = playbookOutcomeBps(series,idx,exitIndex,side,costBps);
    if (!outcome) continue;
    trades.push({ entryIndex:idx,exitIndex,side,regime:analysis.context?.regime || 'unknown',...outcome });
    nextFree = exitIndex + 1;
  }
  return { summary:summarizePlaybookTrades(trades,startIndex,endIndex,horizonBars),trades,decisions };
}

function combineFoldSummaries(folds) {
  const trades = folds.flatMap(item => item.playbookTrades || []);
  if (!folds.length) return { trades:0,returnPct:0,avgNetBps:0,winRatePct:0,profitFactor:null,maxDrawdownPct:0,positiveFolds:0,negativeFolds:0,foldReturns:[] };
  const start = Math.min(...folds.map(item => item.startIndex));
  const end = Math.max(...folds.map(item => item.endIndex));
  const combined = summarizePlaybookTrades(trades,start,end,PLAYBOOK_SHADOW_HORIZON_BARS);
  const foldReturns = folds.map(item => Number(item.playbookSummary.returnPct || 0));
  return {
    ...combined,
    positiveFolds:foldReturns.filter(value => value > 0).length,
    negativeFolds:foldReturns.filter(value => value < 0).length,
    flatFolds:foldReturns.filter(value => value === 0).length,
    foldReturns:foldReturns.map(value => round(value)),
  };
}

export function runPlaybookWalkForward({
  series,
  endIndex,
  estimatedRoundTripCostBps = 0,
  dataSignature = 'unknown',
  startIndex = PLAYBOOK_SHADOW_START_INDEX,
  horizonBars = PLAYBOOK_SHADOW_HORIZON_BARS,
  folds = PLAYBOOK_WALK_FORWARD_FOLDS,
  embargoBars = PLAYBOOK_WALK_FORWARD_EMBARGO_BARS,
} = {}) {
  if (!Array.isArray(series) || series.length <= startIndex + horizonBars + 40) {
    return { version:PLAYBOOK_WALK_FORWARD_VERSION,status:'unavailable',reason:'insufficient-series' };
  }
  const sourceBefore = JSON.stringify(series);
  const safeEnd = Math.min(Number(endIndex ?? series.length - 1),series.length - 1);
  const windows = buildPlaybookWalkForwardWindows(startIndex,safeEnd,folds,embargoBars);
  if (windows.length !== folds) return { version:PLAYBOOK_WALK_FORWARD_VERSION,status:'unavailable',reason:'insufficient-fold-window' };

  const foldResults = windows.map(window => {
    const playbook = runFold({ series,startIndex:window.startIndex,endIndex:window.endIndex,horizonBars,costBps:estimatedRoundTripCostBps });
    const wave1 = runKnowledgeShadow({
      series,
      startIndex:window.startIndex,
      endIndex:window.endIndex,
      horizonBars,
      estimatedRoundTripCostBps,
      dataSignature:`${dataSignature}:fold-${window.fold}`,
    });
    const wave1Summary = wave1.status === 'complete' ? wave1.summary : null;
    return {
      ...window,
      playbookSummary:playbook.summary,
      wave1Summary,
      deltaAvgNetBpsVsWave1:wave1Summary ? round(Number(playbook.summary.avgNetBps || 0) - Number(wave1Summary.avgNetBps || 0)) : null,
      deltaReturnPctVsWave1:wave1Summary ? round(Number(playbook.summary.returnPct || 0) - Number(wave1Summary.returnPct || 0)) : null,
      playbookTrades:playbook.trades,
    };
  });

  if (JSON.stringify(series) !== sourceBefore) return { version:PLAYBOOK_WALK_FORWARD_VERSION,status:'blocked',reason:'source-series-mutated' };

  const aggregate = combineFoldSummaries(foldResults);
  const wave1FoldAvg = foldResults.map(item => Number(item.wave1Summary?.avgNetBps)).filter(Number.isFinite);
  return {
    version:PLAYBOOK_WALK_FORWARD_VERSION,
    status:'complete',
    dataSignature,
    startIndex,
    endIndex:safeEnd,
    folds,
    embargoBars,
    horizonBars,
    estimatedRoundTripCostBps:round(estimatedRoundTripCostBps),
    windows,
    foldResults:foldResults.map(({ playbookTrades,...rest }) => rest),
    aggregate:{
      ...aggregate,
      avgFoldDeltaVsWave1Bps:wave1FoldAvg.length ? round(foldResults.reduce((sum,item) => sum + Number(item.deltaAvgNetBpsVsWave1 || 0),0) / foldResults.length) : null,
    },
    methodology:{
      purpose:'chronological-playbook-holdout-diagnostic',
      chronologicalOrderPreserved:true,
      folds,
      embargoBars,
      fixedHorizonBars:horizonBars,
      exitsCannotCrossFoldBoundary:true,
      priorHistoryAvailableForIndicators:true,
      noFittingPerformed:true,
      optimizer:false,
      parameterSweep:false,
      adaptiveWeights:false,
      selfLearning:false,
      pristineUntouchedOOS:false,
      historicalSeriesAlreadyInspected:true,
      promotionEligible:false,
      automaticPromotion:false,
      championMutation:false,
      usedByLiveDecisionEngine:false,
      usedByForwardEvidence:false,
    },
  };
}
