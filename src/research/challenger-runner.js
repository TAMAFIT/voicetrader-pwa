import { clamp } from '../engine/indicators.js';
import { ShadowEngine } from '../engine/shadow-engine.js';
import { BASELINE_HORIZON_BARS, BASELINE_START_INDEX } from './baseline-runner.js';
import {
  STRATEGY_REGISTRY_VERSION,
  getChampionStrategy,
  getChallengerStrategies,
  getStrategyRegistrySnapshot,
} from './strategy-registry.js';

export const CHALLENGER_RUNNER_VERSION = 'challenger-shadow-0.1';

const round = (value, digits = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

function thresholdDecision({ decisionScore, confidenceScore, direction, decisionThreshold, confidenceThreshold }) {
  if (decisionScore > decisionThreshold && confidenceScore >= confidenceThreshold) {
    return direction === 'UP' ? 'ENTER_LONG' : 'ENTER_SHORT';
  }
  return 'NO_ENTRY';
}

function expertScore(analysis, id) {
  return Number(analysis?.experts?.results?.find(expert => expert.id === id)?.score || 0);
}

export function evaluateStrategyDecision(analysis, strategy) {
  const variant = strategy?.variant || {};

  if (variant.type === 'live-shadow-engine') {
    return {
      entryDecision: analysis.entryDecision,
      direction: analysis.dir,
      confidenceScore: analysis.conf,
      decisionScore: analysis.decisionScore,
      rawAlphaScore: analysis.rawAlphaScore,
      reason: 'live-shadow-engine',
    };
  }

  if (variant.type === 'entry-threshold') {
    const entryDecision = thresholdDecision({
      decisionScore: analysis.decisionScore,
      confidenceScore: analysis.conf,
      direction: analysis.dir,
      decisionThreshold: variant.decisionThreshold,
      confidenceThreshold: variant.confidenceThreshold,
    });
    return {
      entryDecision,
      direction: analysis.dir,
      confidenceScore: analysis.conf,
      decisionScore: analysis.decisionScore,
      rawAlphaScore: analysis.rawAlphaScore,
      reason: 'stricter-entry-threshold',
    };
  }

  if (variant.type === 'trend-weight') {
    const trend = expertScore(analysis, 'trend');
    const momentum = expertScore(analysis, 'momentum');
    const breakout = expertScore(analysis, 'breakout');
    const adjustedRawAlpha = trend * Number(variant.trendWeight || 1) + momentum + breakout;
    const up = clamp(50 + adjustedRawAlpha, 12, 88);
    const direction = up >= 50 ? 'UP' : 'DOWN';
    const confidenceScore = Math.round(Math.max(up, 100 - up));
    const decisionScore = analysis.timing - analysis.risk * .38 + (confidenceScore - 50) * .7;
    const entryDecision = thresholdDecision({
      decisionScore,
      confidenceScore,
      direction,
      decisionThreshold: variant.decisionThreshold,
      confidenceThreshold: variant.confidenceThreshold,
    });
    return {
      entryDecision,
      direction,
      confidenceScore,
      decisionScore,
      rawAlphaScore: adjustedRawAlpha,
      reason: 'fixed-trend-weight-tilt',
    };
  }

  if (variant.type === 'momentum-confirmation') {
    const base = analysis.entryDecision;
    const momentum = expertScore(analysis, 'momentum');
    let aligned = true;
    if (base === 'ENTER_LONG') aligned = momentum >= 0;
    if (base === 'ENTER_SHORT') aligned = momentum <= 0;
    const entryDecision = aligned ? base : 'NO_ENTRY';
    return {
      entryDecision,
      direction: analysis.dir,
      confidenceScore: analysis.conf,
      decisionScore: analysis.decisionScore,
      rawAlphaScore: analysis.rawAlphaScore,
      reason: aligned ? 'momentum-aligned-or-neutral' : 'momentum-conflict-gated',
    };
  }

  return {
    entryDecision: 'NO_ENTRY',
    direction: analysis.dir,
    confidenceScore: analysis.conf,
    decisionScore: analysis.decisionScore,
    rawAlphaScore: analysis.rawAlphaScore,
    reason: 'unknown-variant-fail-closed',
  };
}

function sideFromEntryDecision(entryDecision) {
  if (entryDecision === 'ENTER_LONG') return 'LONG';
  if (entryDecision === 'ENTER_SHORT') return 'SHORT';
  return null;
}

function tradeReturnBps(series, entryIndex, exitIndex, side, costBps) {
  const entry = Number(series[entryIndex]?.c);
  const exit = Number(series[exitIndex]?.c);
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || entry <= 0) return null;
  const gross = side === 'LONG'
    ? (exit / entry - 1) * 10000
    : ((entry - exit) / entry) * 10000;
  return {
    entryPrice: entry,
    exitPrice: exit,
    grossReturnBps: round(gross),
    netReturnBps: round(gross - costBps),
  };
}

function summarizeStrategy({ strategy, trades, startIndex, endIndex }) {
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  let grossProfitBps = 0;
  let grossLossBps = 0;
  let wins = 0;
  let exposureBars = 0;
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
    exposureBars += Number(trade.holdingBars || 0);
    equity *= Math.max(0.000001, 1 + net / 10000);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - equity) / peak : 0);
  }

  const count = trades.length;
  const observedBars = Math.max(1, endIndex - startIndex + 1);
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
    exposurePct: round(Math.min(100, exposureBars / observedBars * 100), 1),
    tradesDetail: trades,
  };
}

function simulateStrategy({ strategy, engine, series, instrument, startIndex, endIndex, horizonBars, costBps }) {
  const trades = [];
  let nextFreeIndex = startIndex;
  for (let idx = startIndex; idx + horizonBars <= endIndex; idx++) {
    if (idx < nextFreeIndex) continue;
    const analysis = engine.analyze(instrument, idx);
    const evaluated = evaluateStrategyDecision(analysis, strategy);
    const side = sideFromEntryDecision(evaluated.entryDecision);
    if (!side) continue;
    const exitIndex = idx + horizonBars;
    const returns = tradeReturnBps(series, idx, exitIndex, side, costBps);
    if (!returns) continue;
    trades.push({
      entryIndex: idx,
      exitIndex,
      side,
      holdingBars: horizonBars,
      sourceEntryDecision: evaluated.entryDecision,
      decisionScore: round(evaluated.decisionScore),
      confidenceScore: round(evaluated.confidenceScore),
      rawAlphaScore: round(evaluated.rawAlphaScore),
      ...returns,
    });
    nextFreeIndex = exitIndex + 1;
  }
  return summarizeStrategy({ strategy, trades, startIndex, endIndex });
}

export function runChallengerShadow({
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
      version: CHALLENGER_RUNNER_VERSION,
      status: 'unavailable',
      reason: 'insufficient-series',
      results: [],
    };
  }

  const safeEnd = Math.min(Number(endIndex ?? series.length - 1), series.length - 1);
  if (safeEnd <= startIndex + horizonBars) {
    return {
      version: CHALLENGER_RUNNER_VERSION,
      status: 'unavailable',
      reason: 'insufficient-observed-bars',
      results: [],
    };
  }

  const champion = getChampionStrategy();
  const challengers = getChallengerStrategies();
  const strategies = [champion, ...challengers];
  const costBps = Math.max(0, Number(estimatedRoundTripCostBps) || 0);
  const engine = new ShadowEngine({ seriesProvider: () => series });
  const rawResults = strategies.map(strategy => simulateStrategy({
    strategy,
    engine,
    series,
    instrument,
    startIndex,
    endIndex: safeEnd,
    horizonBars,
    costBps,
  }));
  const championResult = rawResults[0];
  const results = rawResults.map(result => ({
    ...result,
    deltaVsChampion: {
      returnPct: round(Number(result.returnPct || 0) - Number(championResult.returnPct || 0)),
      avgNetBps: round(Number(result.avgNetBps || 0) - Number(championResult.avgNetBps || 0)),
      trades: Number(result.trades || 0) - Number(championResult.trades || 0),
    },
  }));

  return {
    version: CHALLENGER_RUNNER_VERSION,
    registryVersion: STRATEGY_REGISTRY_VERSION,
    status: 'complete',
    instrument,
    timeframeHours,
    dataSignature,
    startIndex,
    endIndex: safeEnd,
    observedBars: safeEnd - startIndex + 1,
    estimatedRoundTripCostBps: round(costBps),
    methodology: {
      purpose: 'bounded-same-series-challenger-shadow',
      commonExitHorizonBars: horizonBars,
      nonOverlappingTrades: true,
      challengerCount: challengers.length,
      challengerLimit: 3,
      parameterSweep: false,
      selfLearning: false,
      dynamicWeightLearning: false,
      automaticPromotion: false,
      promotionEligible: false,
      outOfSample: false,
      nullControlRequiredBeforeFuturePromotion: true,
      forwardDemoRequiredBeforeFuturePromotion: true,
      usedByLiveDecisionEngine: false,
    },
    registry: getStrategyRegistrySnapshot(),
    results,
  };
}
