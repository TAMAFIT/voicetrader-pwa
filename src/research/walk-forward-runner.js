import { BASELINE_HORIZON_BARS, BASELINE_START_INDEX } from './baseline-runner.js';
import { runChallengerShadow } from './challenger-runner.js';
import { getStrategyRegistrySnapshot } from './strategy-registry.js';

export const WALK_FORWARD_VERSION = 'walk-forward-0.1';
export const WALK_FORWARD_FOLDS = 3;
export const WALK_FORWARD_EMBARGO_BARS = BASELINE_HORIZON_BARS;
export const WALK_FORWARD_MIN_TEST_BARS = 24;

const round = (value, digits = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

export function buildWalkForwardWindows({
  startIndex = BASELINE_START_INDEX,
  endIndex,
  foldCount = WALK_FORWARD_FOLDS,
  embargoBars = WALK_FORWARD_EMBARGO_BARS,
  minTestBars = WALK_FORWARD_MIN_TEST_BARS,
} = {}) {
  const safeStart = Math.max(BASELINE_START_INDEX, Math.floor(Number(startIndex) || BASELINE_START_INDEX));
  const safeEnd = Math.floor(Number(endIndex));
  const safeFolds = Math.max(1, Math.floor(Number(foldCount) || WALK_FORWARD_FOLDS));
  const safeEmbargo = Math.max(BASELINE_HORIZON_BARS, Math.floor(Number(embargoBars) || WALK_FORWARD_EMBARGO_BARS));
  const availableBars = safeEnd - safeStart + 1;
  if (!Number.isFinite(safeEnd) || availableBars <= 0) return [];

  const initialContextBars = Math.max(90, Math.floor(availableBars * 0.5));
  const testCapacity = availableBars - initialContextBars - safeEmbargo * safeFolds;
  const baseFoldBars = Math.floor(testCapacity / safeFolds);
  if (baseFoldBars < minTestBars) return [];

  const windows = [];
  let cursor = safeStart + initialContextBars;
  for (let fold = 0; fold < safeFolds; fold++) {
    const embargoStart = cursor;
    const embargoEnd = embargoStart + safeEmbargo - 1;
    const testStart = embargoEnd + 1;
    const remainingFolds = safeFolds - fold;
    const remainingBars = safeEnd - testStart + 1;
    const testBars = fold === safeFolds - 1
      ? remainingBars
      : Math.floor((remainingBars - safeEmbargo * (remainingFolds - 1)) / remainingFolds);
    const testEnd = testStart + testBars - 1;
    windows.push({
      fold: fold + 1,
      contextStart: 0,
      contextEnd: embargoStart - 1,
      embargoStart,
      embargoEnd,
      embargoBars: safeEmbargo,
      testStart,
      testEnd,
      testBars,
    });
    cursor = testEnd + 1;
  }
  return windows;
}

function summarizeTrades({ strategy, foldStrategyResults }) {
  const trades = foldStrategyResults
    .flatMap(item => item?.tradesDetail || [])
    .sort((a, b) => Number(a.entryIndex) - Number(b.entryIndex));

  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  let grossProfitBps = 0;
  let grossLossBps = 0;
  let wins = 0;
  let longTrades = 0;
  let shortTrades = 0;

  for (const trade of trades) {
    const net = Number(trade.netReturnBps || 0);
    if (net > 0) {
      wins++;
      grossProfitBps += net;
    } else if (net < 0) {
      grossLossBps += Math.abs(net);
    }
    if (trade.side === 'LONG') longTrades++;
    if (trade.side === 'SHORT') shortTrades++;
    equity *= Math.max(0.000001, 1 + net / 10000);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - equity) / peak : 0);
  }

  const foldReturns = foldStrategyResults.map(result => Number(result?.returnPct || 0));
  const count = trades.length;
  return {
    id: strategy.id,
    label: strategy.label,
    role: strategy.role,
    hypothesis: strategy.hypothesis,
    frozenDefinition: strategy.role === 'champion' ? strategy.frozen : strategy.frozenDefinition,
    liveDecisionEngine: strategy.liveDecisionEngine,
    trades: count,
    longTrades,
    shortTrades,
    returnPct: round((equity - 1) * 100),
    winRatePct: count ? round((wins / count) * 100, 1) : 0,
    avgNetBps: count ? round(trades.reduce((sum, trade) => sum + Number(trade.netReturnBps || 0), 0) / count) : 0,
    profitFactor: grossLossBps > 0 ? round(grossProfitBps / grossLossBps) : null,
    maxDrawdownPct: round(maxDrawdown * 100),
    positiveFolds: foldReturns.filter(value => value > 0).length,
    negativeFolds: foldReturns.filter(value => value < 0).length,
    flatFolds: foldReturns.filter(value => value === 0).length,
    foldsWithTrades: foldStrategyResults.filter(result => Number(result?.trades || 0) > 0).length,
    foldReturnsPct: foldReturns.map(value => round(value)),
    tradesDetail: trades,
  };
}

export function runWalkForwardEvaluation({
  series,
  endIndex,
  estimatedRoundTripCostBps = 0,
  dataSignature = 'unknown',
  instrument = 'BTCUSD',
  timeframeHours = 4,
  horizonBars = BASELINE_HORIZON_BARS,
  startIndex = BASELINE_START_INDEX,
} = {}) {
  if (!Array.isArray(series) || series.length <= startIndex + horizonBars) {
    return {
      version: WALK_FORWARD_VERSION,
      status: 'unavailable',
      reason: 'insufficient-series',
      folds: [],
      results: [],
    };
  }

  const safeEnd = Math.min(Number(endIndex ?? series.length - 1), series.length - 1);
  const windows = buildWalkForwardWindows({
    startIndex,
    endIndex: safeEnd,
    foldCount: WALK_FORWARD_FOLDS,
    embargoBars: Math.max(WALK_FORWARD_EMBARGO_BARS, horizonBars),
  });
  if (windows.length !== WALK_FORWARD_FOLDS) {
    return {
      version: WALK_FORWARD_VERSION,
      status: 'unavailable',
      reason: 'insufficient-bars-for-chronological-folds',
      folds: [],
      results: [],
    };
  }

  const costBps = Math.max(0, Number(estimatedRoundTripCostBps) || 0);
  const foldRuns = windows.map(window => {
    const evaluation = runChallengerShadow({
      series,
      endIndex: window.testEnd,
      estimatedRoundTripCostBps: costBps,
      dataSignature: `${dataSignature}:wf${window.fold}`,
      instrument,
      timeframeHours,
      horizonBars,
      startIndex: window.testStart,
    });
    return {
      ...window,
      status: evaluation.status,
      results: evaluation.results,
    };
  });

  if (foldRuns.some(fold => fold.status !== 'complete')) {
    return {
      version: WALK_FORWARD_VERSION,
      status: 'unavailable',
      reason: 'fold-evaluation-unavailable',
      folds: foldRuns,
      results: [],
    };
  }

  const registry = getStrategyRegistrySnapshot();
  const strategies = [registry.champion, ...registry.challengers];
  const rawResults = strategies.map(strategy => summarizeTrades({
    strategy,
    foldStrategyResults: foldRuns.map(fold => fold.results.find(result => result.id === strategy.id)),
  }));
  const champion = rawResults[0];
  const results = rawResults.map(result => ({
    ...result,
    deltaVsChampion: {
      returnPct: round(Number(result.returnPct || 0) - Number(champion.returnPct || 0)),
      avgNetBps: round(Number(result.avgNetBps || 0) - Number(champion.avgNetBps || 0)),
      positiveFolds: Number(result.positiveFolds || 0) - Number(champion.positiveFolds || 0),
    },
  }));

  return {
    version: WALK_FORWARD_VERSION,
    status: 'complete',
    instrument,
    timeframeHours,
    dataSignature,
    startIndex,
    endIndex: safeEnd,
    estimatedRoundTripCostBps: round(costBps),
    methodology: {
      purpose: 'chronological-holdout-walk-forward-diagnostic',
      folds: WALK_FORWARD_FOLDS,
      embargoBars: Math.max(WALK_FORWARD_EMBARGO_BARS, horizonBars),
      commonExitHorizonBars: horizonBars,
      chronologicalOrderPreserved: true,
      noFittingPerformed: true,
      priorBarsUsedForIndicatorsOnly: true,
      strategyDefinitionsFrozenBeforeFoldEvaluation: true,
      parameterSweep: false,
      selfLearning: false,
      automaticPromotion: false,
      promotionEligible: false,
      pristineUntouchedOOS: false,
      reasonNotPristine: 'The currently loaded historical series has already been inspected by same-series research views; use this as a chronological holdout diagnostic, not final untouched OOS proof.',
      forwardDemoRequiredBeforeFuturePromotion: true,
      usedByLiveDecisionEngine: false,
    },
    folds: foldRuns.map(fold => ({
      fold: fold.fold,
      contextStart: fold.contextStart,
      contextEnd: fold.contextEnd,
      embargoStart: fold.embargoStart,
      embargoEnd: fold.embargoEnd,
      embargoBars: fold.embargoBars,
      testStart: fold.testStart,
      testEnd: fold.testEnd,
      testBars: fold.testBars,
      results: fold.results.map(({ tradesDetail, ...summary }) => summary),
    })),
    results,
  };
}
