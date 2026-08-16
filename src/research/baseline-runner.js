import { sma, rsi } from '../engine/indicators.js';
import { ShadowEngine } from '../engine/shadow-engine.js';

export const BASELINE_RUNNER_VERSION = 'baseline-runner-0.1';
export const BASELINE_HORIZON_BARS = 3;
export const BASELINE_START_INDEX = 60;

const round = (value, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
};

function seedFromText(text) {
  let hash = 2166136261;
  for (const ch of String(text || 'voicetrader')) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRng(seedText) {
  let seed = seedFromText(seedText);
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function shuffle(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
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

function simulateSignals({
  id,
  label,
  series,
  startIndex,
  endIndex,
  horizonBars,
  costBps,
  signalAt,
  note,
}) {
  const trades = [];
  let nextFreeIndex = startIndex;
  for (let idx = startIndex; idx + horizonBars <= endIndex; idx++) {
    if (idx < nextFreeIndex) continue;
    const side = signalAt(idx);
    if (side !== 'LONG' && side !== 'SHORT') continue;
    const exitIndex = idx + horizonBars;
    const returns = tradeReturnBps(series, idx, exitIndex, side, costBps);
    if (!returns) continue;
    trades.push({
      entryIndex: idx,
      exitIndex,
      side,
      holdingBars: horizonBars,
      ...returns,
    });
    nextFreeIndex = exitIndex + 1;
  }
  return summarizeStrategy({ id, label, trades, startIndex, endIndex, note });
}

function summarizeStrategy({ id, label, trades, startIndex, endIndex, note }) {
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
    id,
    label,
    note,
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

function buyAndHold({ series, startIndex, endIndex, costBps }) {
  if (endIndex <= startIndex) {
    return summarizeStrategy({ id: 'buy_hold', label: 'Buy & Hold', trades: [], startIndex, endIndex, note: 'BTCを同期間保有' });
  }
  const returns = tradeReturnBps(series, startIndex, endIndex, 'LONG', costBps);
  const trades = returns ? [{
    entryIndex: startIndex,
    exitIndex: endIndex,
    side: 'LONG',
    holdingBars: endIndex - startIndex,
    ...returns,
  }] : [];
  return summarizeStrategy({
    id: 'buy_hold',
    label: 'Buy & Hold',
    trades,
    startIndex,
    endIndex,
    note: '同一評価期間をBTCロングで保有',
  });
}

function buildNonOverlappingGrids({ startIndex, endIndex, horizonBars }) {
  const stride = horizonBars + 1;
  return Array.from({ length: stride }, (_, offset) => {
    const entries = [];
    for (let idx = startIndex + offset; idx + horizonBars <= endIndex; idx += stride) entries.push(idx);
    return entries;
  });
}

function matchedRandom({ series, startIndex, endIndex, horizonBars, costBps, champion, seed }) {
  const targetCount = champion.trades;
  if (!targetCount) {
    return summarizeStrategy({
      id: 'matched_random',
      label: 'Matched Random',
      trades: [],
      startIndex,
      endIndex,
      note: 'Championの取引回数・保有期間・Long/Short比率に合わせる決定論的Random',
    });
  }

  const random = makeRng(seed);
  const grids = buildNonOverlappingGrids({ startIndex, endIndex, horizonBars });
  const capableGrids = grids.filter(entries => entries.length >= targetCount);
  const fallback = [...grids].sort((a, b) => b.length - a.length)[0] || [];
  const sourceGrid = capableGrids.length
    ? capableGrids[Math.floor(random() * capableGrids.length)]
    : fallback;
  const selected = shuffle(sourceGrid, random).slice(0, targetCount).sort((a, b) => a - b);

  const sides = shuffle([
    ...Array.from({ length: champion.longTrades }, () => 'LONG'),
    ...Array.from({ length: champion.shortTrades }, () => 'SHORT'),
  ], random);

  const trades = selected.map((entryIndex, index) => {
    const side = sides[index] || (random() >= 0.5 ? 'LONG' : 'SHORT');
    const exitIndex = entryIndex + horizonBars;
    const returns = tradeReturnBps(series, entryIndex, exitIndex, side, costBps);
    return returns ? {
      entryIndex,
      exitIndex,
      side,
      holdingBars: horizonBars,
      ...returns,
    } : null;
  }).filter(Boolean);

  return summarizeStrategy({
    id: 'matched_random',
    label: 'Matched Random',
    trades,
    startIndex,
    endIndex,
    note: 'Championの取引回数・固定保有期間・Long/Short比率に合わせる決定論的Random',
  });
}

export function runBaselineSuite({
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
      version: BASELINE_RUNNER_VERSION,
      status: 'unavailable',
      reason: 'insufficient-series',
      results: [],
    };
  }

  const safeEnd = Math.min(Number(endIndex ?? series.length - 1), series.length - 1);
  if (safeEnd <= startIndex + horizonBars) {
    return {
      version: BASELINE_RUNNER_VERSION,
      status: 'unavailable',
      reason: 'insufficient-observed-bars',
      results: [],
    };
  }

  const costBps = Math.max(0, Number(estimatedRoundTripCostBps) || 0);
  const localEngine = new ShadowEngine({ seriesProvider: () => series });

  const champion = simulateSignals({
    id: 'champion',
    label: 'Champion',
    series,
    startIndex,
    endIndex: safeEnd,
    horizonBars,
    costBps,
    signalAt: idx => {
      const decision = localEngine.analyze(instrument, idx).entryDecision;
      if (decision === 'ENTER_LONG') return 'LONG';
      if (decision === 'ENTER_SHORT') return 'SHORT';
      return null;
    },
    note: `現行Shadow EngineのEntry判断を共通${horizonBars}バーExitで評価`,
  });

  const trend = simulateSignals({
    id: 'simple_trend',
    label: 'Simple Trend',
    series,
    startIndex,
    endIndex: safeEnd,
    horizonBars,
    costBps,
    signalAt: idx => {
      const fast = sma(series, 20, idx);
      const slow = sma(series, 60, idx);
      if (!Number.isFinite(fast) || !Number.isFinite(slow)) return null;
      return fast >= slow ? 'LONG' : 'SHORT';
    },
    note: `MA20/MA60方向を共通${horizonBars}バーExitで評価`,
  });

  const meanReversion = simulateSignals({
    id: 'simple_mean_reversion',
    label: 'Mean Reversion',
    series,
    startIndex,
    endIndex: safeEnd,
    horizonBars,
    costBps,
    signalAt: idx => {
      const value = rsi(series, 14, idx);
      if (value <= 35) return 'LONG';
      if (value >= 65) return 'SHORT';
      return null;
    },
    note: `RSI14 <=35 / >=65を共通${horizonBars}バーExitで評価`,
  });

  const hold = buyAndHold({ series, startIndex, endIndex: safeEnd, costBps });
  const random = matchedRandom({
    series,
    startIndex,
    endIndex: safeEnd,
    horizonBars,
    costBps,
    champion,
    seed: `${dataSignature}:${safeEnd}:${horizonBars}`,
  });

  return {
    version: BASELINE_RUNNER_VERSION,
    status: 'complete',
    instrument,
    timeframeHours,
    dataSignature,
    startIndex,
    endIndex: safeEnd,
    observedBars: safeEnd - startIndex + 1,
    estimatedRoundTripCostBps: round(costBps),
    methodology: {
      purpose: 'descriptive-same-series-comparator',
      edgeProof: false,
      optimizer: false,
      parameterSweep: false,
      commonSignalExitHorizonBars: horizonBars,
      signalStrategiesUseNonOverlappingTrades: true,
      championMutation: false,
      matchedRandomDeterministic: true,
      matchedRandomTradeCountRule: 'same-as-champion',
      maxDrawdownBasis: 'closed-trade-equity',
    },
    results: [champion, hold, trend, meanReversion, random],
  };
}
