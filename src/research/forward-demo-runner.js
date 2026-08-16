import { ShadowEngine } from '../engine/shadow-engine.js';
import { ExecutionEngine } from '../engine/execution-engine.js';
import { CHALLENGER_RUNNER_VERSION, evaluateStrategyDecision } from './challenger-runner.js';
import { FORWARD_EPOCH, getForwardEpochSnapshot } from './forward-epoch.js';

export const FORWARD_DEMO_VERSION = 'forward-demo-0.1';

const round = (value, digits = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

function sideFromDecision(decision) {
  if (decision === 'ENTER_LONG') return 'LONG';
  if (decision === 'ENTER_SHORT') return 'SHORT';
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

export function getPostFreezeBarIndexes(series = [], epoch = FORWARD_EPOCH) {
  return series
    .map((bar, index) => ({ index, t: Number(bar?.t) }))
    .filter(item => Number.isFinite(item.t) && item.t > epoch.frozenAtUnix)
    .map(item => item.index);
}

function validateFrozenRuntime(engine, execution, epoch) {
  const errors = [];
  if (engine.version !== epoch.provenance.shadowEngineVersion) {
    errors.push(`shadow-engine-version:${engine.version}`);
  }
  if (CHALLENGER_RUNNER_VERSION !== epoch.provenance.decisionEvaluatorVersion) {
    errors.push(`decision-evaluator-version:${CHALLENGER_RUNNER_VERSION}`);
  }
  if (execution.profile !== epoch.provenance.executionProfile) {
    errors.push(`execution-profile:${execution.profile}`);
  }
  return errors;
}

export function runProspectiveForwardSnapshot({
  series,
  dataSignature = 'unknown',
  instrument = FORWARD_EPOCH.instrument,
  timeframeHours = FORWARD_EPOCH.timeframeHours,
  resumeAfterByStrategy = {},
  observedAt = Date.now(),
  epoch = FORWARD_EPOCH,
} = {}) {
  if (!Array.isArray(series) || series.length < 80) {
    return { version: FORWARD_DEMO_VERSION, status: 'unavailable', reason: 'insufficient-series', trades: [], decisions: [] };
  }

  let currentIndex = series.length - 1;
  const engine = new ShadowEngine({ seriesProvider: () => series });
  const execution = new ExecutionEngine({
    random: () => 0.5,
    analyze: () => engine.analyze(instrument, currentIndex),
  });
  const runtimeErrors = validateFrozenRuntime(engine, execution, epoch);
  if (runtimeErrors.length) {
    return {
      version: FORWARD_DEMO_VERSION,
      status: 'blocked',
      reason: 'frozen-runtime-version-mismatch',
      runtimeErrors,
      trades: [],
      decisions: [],
      epoch: getForwardEpochSnapshot(),
    };
  }

  const postFreezeIndexes = getPostFreezeBarIndexes(series, epoch);
  const postFreezeTimes = postFreezeIndexes.map(index => Number(series[index].t));
  const lastIndex = series.length - 1;
  const horizonBars = epoch.horizonBars;
  const trades = [];
  const decisions = [];

  for (const strategy of epoch.strategies) {
    const resumeAfterTime = Math.max(epoch.frozenAtUnix, Number(resumeAfterByStrategy[strategy.id] || epoch.frozenAtUnix));
    let nextFreeIndex = postFreezeIndexes.find(index => Number(series[index].t) > resumeAfterTime) ?? (lastIndex + 1);

    for (const idx of postFreezeIndexes) {
      if (idx < nextFreeIndex) continue;
      const entryTime = Number(series[idx]?.t);
      if (!(entryTime > resumeAfterTime) || idx + horizonBars > lastIndex) continue;
      const exitIndex = idx + horizonBars;
      const exitTime = Number(series[exitIndex]?.t);
      if (!(exitTime > epoch.frozenAtUnix)) continue;

      currentIndex = idx;
      const analysis = engine.analyze(instrument, idx);
      const evaluated = evaluateStrategyDecision(analysis, strategy);
      const side = sideFromDecision(evaluated.entryDecision);
      decisions.push({
        epochId: epoch.id,
        strategyId: strategy.id,
        candleTime: entryTime,
        entryDecision: evaluated.entryDecision,
        decisionScore: round(evaluated.decisionScore),
        confidenceScore: round(evaluated.confidenceScore),
      });
      if (!side) continue;

      const estimatedRoundTripCostBps = execution.estimateRoundTripCostBps(instrument);
      const returns = tradeReturnBps(series, idx, exitIndex, side, estimatedRoundTripCostBps);
      if (!returns) continue;
      const evidenceKey = `${epoch.id}:${strategy.id}:${entryTime}:${exitTime}`;
      trades.push({
        evidenceKey,
        epochId: epoch.id,
        prospective: true,
        strategyId: strategy.id,
        strategyLabel: strategy.label,
        role: strategy.role,
        instrument,
        timeframeHours,
        entryTime,
        exitTime,
        entryIndex: idx,
        exitIndex,
        side,
        holdingBars: horizonBars,
        dataSignature,
        observedAt,
        engineVersion: analysis.engineVersion,
        decisionEvaluatorVersion: CHALLENGER_RUNNER_VERSION,
        executionProfile: execution.profile,
        estimatedRoundTripCostBps: round(estimatedRoundTripCostBps),
        decisionScore: round(evaluated.decisionScore),
        confidenceScore: round(evaluated.confidenceScore),
        rawAlphaScore: round(evaluated.rawAlphaScore),
        ...returns,
      });
      nextFreeIndex = exitIndex + 1;
    }
  }

  return {
    version: FORWARD_DEMO_VERSION,
    status: 'complete',
    epoch: getForwardEpochSnapshot(),
    dataSignature,
    instrument,
    timeframeHours,
    observedAt,
    observedPostFreezeBars: postFreezeTimes.length,
    postFreezeBarTimes: postFreezeTimes,
    firstPostFreezeBarTime: postFreezeTimes[0] || null,
    lastPostFreezeBarTime: postFreezeTimes.at(-1) || null,
    completedProspectiveTrades: trades.length,
    trades,
    decisions,
    methodology: {
      prospectiveOnly: true,
      entryTimestampStrictlyAfterFreeze: true,
      closedCandlesOnly: true,
      preFreezeBarsUsedForIndicatorsOnly: true,
      startsFlatAtFreeze: true,
      commonExitHorizonBars: horizonBars,
      deterministicExpectedCost: true,
      stochasticExecutionUsed: false,
      parameterSweep: false,
      optimization: false,
      selfLearning: false,
      dynamicWeightLearning: false,
      automaticPromotion: false,
      promotionEligible: false,
      usedByLiveDecisionEngine: false,
    },
  };
}

export function summarizeForwardTrades({ trades = [], epoch = FORWARD_EPOCH, observedBarTimes = [] } = {}) {
  const results = epoch.strategies.map(strategy => {
    const strategyTrades = trades
      .filter(trade => trade.epochId === epoch.id && trade.strategyId === strategy.id)
      .sort((a, b) => Number(a.entryTime) - Number(b.entryTime));
    let equity = 1;
    let peak = 1;
    let maxDrawdown = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let wins = 0;
    for (const trade of strategyTrades) {
      const net = Number(trade.netReturnBps || 0);
      if (net > 0) { wins++; grossProfit += net; }
      if (net < 0) grossLoss += Math.abs(net);
      equity *= Math.max(0.000001, 1 + net / 10000);
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - equity) / peak : 0);
    }
    const count = strategyTrades.length;
    return {
      id: strategy.id,
      label: strategy.label,
      role: strategy.role,
      trades: count,
      returnPct: round((equity - 1) * 100),
      avgNetBps: count ? round(strategyTrades.reduce((sum, trade) => sum + Number(trade.netReturnBps || 0), 0) / count) : 0,
      profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss) : null,
      winRatePct: count ? round(wins / count * 100, 1) : 0,
      maxDrawdownPct: round(maxDrawdown * 100),
      lastExitTime: strategyTrades.at(-1)?.exitTime || null,
    };
  });
  const uniqueBars = [...new Set(observedBarTimes.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  return {
    version: FORWARD_DEMO_VERSION,
    status: 'complete',
    epoch: getForwardEpochSnapshot(),
    observedPostFreezeBars: uniqueBars.length,
    firstObservedBarTime: uniqueBars[0] || null,
    lastObservedBarTime: uniqueBars.at(-1) || null,
    completedProspectiveTrades: trades.filter(trade => trade.epochId === epoch.id).length,
    results,
    methodology: {
      prospectiveOnly: true,
      localArchive: true,
      automaticPromotion: false,
      promotionEligible: false,
    },
  };
}
