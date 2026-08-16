import { INITIAL_CAPITAL } from '../config.js';
import { ShadowEngine } from '../engine/shadow-engine.js';
import { ExecutionEngine } from '../engine/execution-engine.js';
import { CHALLENGER_RUNNER_VERSION, evaluateStrategyDecision } from '../research/challenger-runner.js';
import { FORWARD_EPOCH } from '../research/forward-epoch.js';
import { STRATEGY_REGISTRY_VERSION, getChampionStrategy } from '../research/strategy-registry.js';

export const LIVE_FORWARD_VERSION = 'live-forward-paper-0.1';
export const LIVE_FORWARD_STORAGE_VERSION = 1;
export const LIVE_FORWARD_INITIAL_CAPITAL = INITIAL_CAPITAL;

const MAX_AUDIT_EVENTS = 1200;
const INTERVAL_SECONDS = FORWARD_EPOCH.timeframeHours * 60 * 60;

const round = (value, digits = 4) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sideFromDecision(decision) {
  if (decision === 'ENTER_LONG') return 'LONG';
  if (decision === 'ENTER_SHORT') return 'SHORT';
  return null;
}

function nextAlignedOpenAfter(unix, intervalSeconds = INTERVAL_SECONDS) {
  return (Math.floor(Number(unix) / intervalSeconds) + 1) * intervalSeconds;
}

function hasProcessedCandle(state) {
  const value = state?.lastProcessedCandleTime;
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function expectedNextTime(state, epoch = FORWARD_EPOCH) {
  if (hasProcessedCandle(state)) {
    return Number(state.lastProcessedCandleTime) + epoch.timeframeHours * 60 * 60;
  }
  return nextAlignedOpenAfter(epoch.frozenAtUnix, epoch.timeframeHours * 60 * 60);
}

function sameVariant(a, b) {
  return JSON.stringify(a || {}) === JSON.stringify(b || {});
}

export function createLiveForwardState({ epoch = FORWARD_EPOCH, now = Date.now() } = {}) {
  return {
    version: LIVE_FORWARD_VERSION,
    storageVersion: LIVE_FORWARD_STORAGE_VERSION,
    epochId: epoch.id,
    instrument: epoch.instrument,
    timeframeHours: epoch.timeframeHours,
    horizonBars: epoch.horizonBars,
    initialCapital: LIVE_FORWARD_INITIAL_CAPITAL,
    equity: LIVE_FORWARD_INITIAL_CAPITAL,
    realizedReturnPct: 0,
    position: null,
    lastProcessedCandleTime: null,
    processedCandles: 0,
    noEntryDecisions: 0,
    holdBarsProcessed: 0,
    trades: [],
    audit: [],
    createdAt: now,
    updatedAt: now,
    lastPollAt: null,
    lastDataSignature: null,
    runtime: {
      frozen: true,
      realMoneyRouting: false,
      automaticPromotion: false,
      forwardEvidenceCoupled: false,
    },
  };
}

export function validateLiveForwardRuntime({ engine, execution, epoch = FORWARD_EPOCH, champion = getChampionStrategy() } = {}) {
  const errors = [];
  if (!engine || engine.version !== epoch.provenance.shadowEngineVersion) {
    errors.push(`shadow-engine-version:${engine?.version || 'missing'}`);
  }
  if (CHALLENGER_RUNNER_VERSION !== epoch.provenance.decisionEvaluatorVersion) {
    errors.push(`decision-evaluator-version:${CHALLENGER_RUNNER_VERSION}`);
  }
  if (!execution || execution.profile !== epoch.provenance.executionProfile) {
    errors.push(`execution-profile:${execution?.profile || 'missing'}`);
  }
  if (STRATEGY_REGISTRY_VERSION !== epoch.provenance.strategyRegistryVersion) {
    errors.push(`strategy-registry-version:${STRATEGY_REGISTRY_VERSION}`);
  }
  const epochChampion = epoch.strategies.find(strategy => strategy.role === 'champion');
  if (!epochChampion || champion?.id !== epochChampion.id || !sameVariant(champion?.variant, epochChampion.variant)) {
    errors.push('champion-definition-mismatch');
  }
  return errors;
}

function normalizeState(state, epoch, observedAt) {
  if (!state) return createLiveForwardState({ epoch, now: observedAt });
  if (state.version !== LIVE_FORWARD_VERSION || state.epochId !== epoch.id) {
    return null;
  }
  return clone(state);
}

function appendAudit(state, event) {
  state.audit.push(event);
  if (state.audit.length > MAX_AUDIT_EVENTS) {
    state.audit = state.audit.slice(-MAX_AUDIT_EVENTS);
  }
}

function calculateTradeReturn({ entryPrice, exitPrice, side, costBps }) {
  const entry = Number(entryPrice);
  const exit = Number(exitPrice);
  if (!(entry > 0) || !(exit > 0)) return null;
  const grossReturnBps = side === 'LONG'
    ? (exit / entry - 1) * 10000
    : ((entry - exit) / entry) * 10000;
  return {
    grossReturnBps: round(grossReturnBps, 2),
    netReturnBps: round(grossReturnBps - Number(costBps || 0), 2),
  };
}

function verifySource(meta, epoch) {
  if (!meta) return 'missing-market-meta';
  if (meta.sourceType !== 'real') return `non-live-source:${meta.sourceType || 'unknown'}`;
  if (meta.researchEligible !== true) return 'market-not-research-eligible';
  if (meta.instrument !== epoch.instrument) return `instrument-mismatch:${meta.instrument || 'unknown'}`;
  if (Number(meta.timeframeHours) !== Number(epoch.timeframeHours)) return `timeframe-mismatch:${meta.timeframeHours || 'unknown'}`;
  return null;
}

export function processLiveForwardSnapshot({
  series,
  meta,
  state = null,
  observedAt = Date.now(),
  epoch = FORWARD_EPOCH,
  engineFactory = ({ series: source }) => new ShadowEngine({ seriesProvider: () => source }),
  executionFactory = ({ engine, instrument, getIndex }) => new ExecutionEngine({
    random: () => 0.5,
    analyze: () => engine.analyze(instrument, getIndex()),
  }),
} = {}) {
  if (!Array.isArray(series) || series.length < 40) {
    return { status: 'blocked', reason: 'insufficient-series', state, processedNow: 0, newTrades: [] };
  }

  const sourceError = verifySource(meta, epoch);
  if (sourceError) {
    return { status: 'blocked', reason: sourceError, state, processedNow: 0, newTrades: [] };
  }

  const nextState = normalizeState(state, epoch, observedAt);
  if (!nextState) {
    return { status: 'blocked', reason: 'stored-state-contract-mismatch', state, processedNow: 0, newTrades: [] };
  }

  let currentIndex = series.length - 1;
  const engine = engineFactory({ series, epoch });
  const execution = executionFactory({ engine, instrument: epoch.instrument, getIndex: () => currentIndex, series, epoch });
  const champion = getChampionStrategy();
  const runtimeErrors = validateLiveForwardRuntime({ engine, execution, epoch, champion });
  if (runtimeErrors.length) {
    return {
      status: 'blocked',
      reason: 'frozen-runtime-version-mismatch',
      runtimeErrors,
      state: nextState,
      processedNow: 0,
      newTrades: [],
    };
  }

  const sourceBefore = JSON.stringify(series);
  const intervalSeconds = epoch.timeframeHours * 60 * 60;
  const eligible = series
    .map((bar, index) => ({ index, t: Number(bar?.t), c: Number(bar?.c) }))
    .filter(item => Number.isFinite(item.t) && Number.isFinite(item.c) && item.t > epoch.frozenAtUnix)
    .sort((a, b) => a.t - b.t);

  nextState.lastPollAt = observedAt;
  nextState.lastDataSignature = meta.signature || null;

  if (!eligible.length) {
    nextState.updatedAt = observedAt;
    return {
      status: 'waiting',
      reason: 'waiting-first-post-freeze-candle',
      state: nextState,
      processedNow: 0,
      newTrades: [],
      latestClosedCandleTime: Number(series.at(-1)?.t) || null,
      nextExpectedCandleTime: expectedNextTime(nextState, epoch),
    };
  }

  const expected = expectedNextTime(nextState, epoch);
  const pending = eligible.filter(item => !hasProcessedCandle(nextState) || item.t > Number(nextState.lastProcessedCandleTime));
  if (pending.length && pending[0].t !== expected) {
    return {
      status: 'blocked',
      reason: 'closed-candle-continuity-gap',
      expectedCandleTime: expected,
      firstAvailableCandleTime: pending[0].t,
      state: nextState,
      processedNow: 0,
      newTrades: [],
    };
  }

  const newTrades = [];
  let processedNow = 0;

  for (const item of pending) {
    const expectedTime = expectedNextTime(nextState, epoch);
    if (item.t !== expectedTime) {
      return {
        status: 'blocked',
        reason: 'closed-candle-continuity-gap',
        expectedCandleTime: expectedTime,
        firstAvailableCandleTime: item.t,
        state: nextState,
        processedNow,
        newTrades,
      };
    }

    currentIndex = item.index;
    const candle = series[item.index];
    const candleTime = item.t;
    let consumedByExit = false;

    if (nextState.position) {
      const dueExitTime = Number(nextState.position.dueExitTime);
      const heldBars = Math.round((candleTime - Number(nextState.position.entryTime)) / intervalSeconds);
      if (candleTime >= dueExitTime) {
        const returns = calculateTradeReturn({
          entryPrice: nextState.position.entryPrice,
          exitPrice: candle.c,
          side: nextState.position.side,
          costBps: nextState.position.estimatedRoundTripCostBps,
        });
        if (!returns) {
          return { status: 'blocked', reason: 'invalid-exit-price', state: nextState, processedNow, newTrades };
        }
        const equityBefore = Number(nextState.equity);
        const equityAfter = Math.max(0.000001, equityBefore * (1 + returns.netReturnBps / 10000));
        const trade = {
          tradeId: `${epoch.id}:paper:${nextState.position.entryTime}:${candleTime}`,
          epochId: epoch.id,
          strategyId: champion.id,
          instrument: epoch.instrument,
          timeframeHours: epoch.timeframeHours,
          side: nextState.position.side,
          entryTime: nextState.position.entryTime,
          exitTime: candleTime,
          entryPrice: nextState.position.entryPrice,
          exitPrice: Number(candle.c),
          holdingBars: heldBars,
          exitReason: 'fixed-horizon-time-exit',
          estimatedRoundTripCostBps: nextState.position.estimatedRoundTripCostBps,
          decisionScore: nextState.position.decisionScore,
          confidenceScore: nextState.position.confidenceScore,
          rawAlphaScore: nextState.position.rawAlphaScore,
          grossReturnBps: returns.grossReturnBps,
          netReturnBps: returns.netReturnBps,
          equityBefore: round(equityBefore, 4),
          equityAfter: round(equityAfter, 4),
          dataSignature: meta.signature || null,
          closedAtObservedAt: observedAt,
        };
        nextState.trades.push(trade);
        nextState.equity = equityAfter;
        nextState.realizedReturnPct = round((equityAfter / nextState.initialCapital - 1) * 100, 4);
        nextState.position = null;
        newTrades.push(trade);
        appendAudit(nextState, {
          type: 'EXIT',
          candleTime,
          side: trade.side,
          netReturnBps: trade.netReturnBps,
          equityAfter: trade.equityAfter,
          reason: trade.exitReason,
        });
        consumedByExit = true;
      } else {
        nextState.holdBarsProcessed += 1;
        appendAudit(nextState, {
          type: 'HOLD',
          candleTime,
          side: nextState.position.side,
          barsHeld: heldBars,
          dueExitTime,
        });
      }
    }

    if (!nextState.position && !consumedByExit) {
      const analysis = engine.analyze(epoch.instrument, item.index);
      const evaluated = evaluateStrategyDecision(analysis, champion);
      const side = sideFromDecision(evaluated.entryDecision);
      if (side) {
        const costBps = execution.estimateRoundTripCostBps(epoch.instrument);
        nextState.position = {
          side,
          entryTime: candleTime,
          dueExitTime: candleTime + epoch.horizonBars * intervalSeconds,
          entryPrice: Number(candle.c),
          entryDecision: evaluated.entryDecision,
          decisionScore: round(evaluated.decisionScore, 2),
          confidenceScore: round(evaluated.confidenceScore, 2),
          rawAlphaScore: round(evaluated.rawAlphaScore, 2),
          estimatedRoundTripCostBps: round(costBps, 2),
          openedAtObservedAt: observedAt,
          dataSignature: meta.signature || null,
        };
        appendAudit(nextState, {
          type: 'ENTER',
          candleTime,
          side,
          entryPrice: Number(candle.c),
          dueExitTime: nextState.position.dueExitTime,
          decisionScore: nextState.position.decisionScore,
          confidenceScore: nextState.position.confidenceScore,
        });
      } else {
        nextState.noEntryDecisions += 1;
        appendAudit(nextState, {
          type: 'NO_ENTRY',
          candleTime,
          decisionScore: round(evaluated.decisionScore, 2),
          confidenceScore: round(evaluated.confidenceScore, 2),
          direction: evaluated.direction,
        });
      }
    }

    nextState.lastProcessedCandleTime = candleTime;
    nextState.processedCandles += 1;
    processedNow += 1;
  }

  nextState.updatedAt = observedAt;
  if (JSON.stringify(series) !== sourceBefore) {
    return { status: 'blocked', reason: 'source-series-mutated', state, processedNow: 0, newTrades: [] };
  }

  return {
    status: processedNow ? 'running' : 'waiting',
    reason: processedNow ? 'new-closed-candles-processed' : 'no-new-closed-candle',
    state: nextState,
    processedNow,
    newTrades,
    latestClosedCandleTime: eligible.at(-1)?.t || Number(series.at(-1)?.t) || null,
    nextExpectedCandleTime: expectedNextTime(nextState, epoch),
    methodology: {
      browserOpenLoop: true,
      privateExchangeApi: false,
      realMoneyRouting: false,
      exactOnceByCandleTimestamp: true,
      catchUpEnabled: true,
      startsAtFrozenEpoch: true,
      fixedExitHorizonBars: epoch.horizonBars,
      noReentryOnExitCandle: true,
      deterministicExpectedRoundTripCost: true,
      stochasticFillSimulation: false,
      forwardEvidenceCoupled: false,
      optimizer: false,
      selfLearning: false,
      automaticPromotion: false,
    },
  };
}

export function summarizeLiveForwardState(state, latestPrice = null) {
  const safe = state || createLiveForwardState();
  const trades = Array.isArray(safe.trades) ? safe.trades : [];
  const wins = trades.filter(trade => Number(trade.netReturnBps) > 0).length;
  const position = safe.position || null;
  let unrealizedGrossBps = null;
  if (position && Number(latestPrice) > 0 && Number(position.entryPrice) > 0) {
    unrealizedGrossBps = position.side === 'LONG'
      ? (Number(latestPrice) / Number(position.entryPrice) - 1) * 10000
      : ((Number(position.entryPrice) - Number(latestPrice)) / Number(position.entryPrice)) * 10000;
  }
  return {
    equity: round(safe.equity, 2),
    realizedReturnPct: round(safe.realizedReturnPct, 4),
    trades: trades.length,
    wins,
    winRatePct: trades.length ? round(wins / trades.length * 100, 1) : 0,
    processedCandles: Number(safe.processedCandles || 0),
    lastProcessedCandleTime: safe.lastProcessedCandleTime || null,
    position: position ? { ...position, unrealizedGrossBps: round(unrealizedGrossBps, 2) } : null,
    recentTrades: trades.slice(-5).reverse(),
  };
}
