import { ShadowEngine } from '../engine/shadow-engine.js';
import { runBaselineSuite, BASELINE_HORIZON_BARS, BASELINE_START_INDEX } from './baseline-runner.js';

export const NULL_CONTROL_VERSION = 'null-market-controls-0.1';
export const NULL_CONTROL_REPLICATES = 24;
export const NULL_BLOCK_SIZE = 6;

const round = (value, digits = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

function seedFromText(text) {
  let hash = 2166136261;
  for (const ch of String(text || 'voicetrader-null')) {
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

function quantile(values, q) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[Math.min(base + 1, sorted.length - 1)];
  return sorted[base] + rest * (next - sorted[base]);
}

function candleAtoms(series) {
  const atoms = [];
  for (let i = 1; i < series.length; i++) {
    const previousClose = Number(series[i - 1]?.c);
    const bar = series[i];
    const open = Number(bar?.o);
    const high = Number(bar?.h);
    const low = Number(bar?.l);
    const close = Number(bar?.c);
    if (![previousClose, open, high, low, close].every(Number.isFinite) || previousClose <= 0 || open <= 0 || close <= 0) continue;
    const bodyHigh = Math.max(open, close);
    const bodyLow = Math.min(open, close);
    atoms.push({
      closeReturn: close / previousClose - 1,
      openRatio: open / previousClose,
      upperWick: Math.max(0, high / bodyHigh - 1),
      lowerWick: Math.max(0, 1 - low / bodyLow),
      volume: Number(bar.volume || 0),
      trades: Number(bar.trades || 0),
    });
  }
  return atoms;
}

function rebuildSeries(source, orderedAtoms) {
  if (!source.length || orderedAtoms.length < source.length - 1) return [];
  const first = { ...source[0] };
  const out = [first];
  for (let i = 1; i < source.length; i++) {
    const atom = orderedAtoms[i - 1];
    const previousClose = Number(out[i - 1].c);
    const open = Math.max(0.000001, previousClose * atom.openRatio);
    const close = Math.max(0.000001, previousClose * (1 + atom.closeReturn));
    const bodyHigh = Math.max(open, close);
    const bodyLow = Math.min(open, close);
    out.push({
      t: Number(source[i]?.t || 0),
      o: open,
      h: bodyHigh * (1 + atom.upperWick),
      l: Math.max(0.000001, bodyLow * (1 - atom.lowerWick)),
      c: close,
      volume: atom.volume,
      trades: atom.trades,
    });
  }
  return out;
}

export function buildReturnShuffleSeries(series, seed) {
  const atoms = candleAtoms(series);
  return rebuildSeries(series, shuffle(atoms, makeRng(seed)));
}

export function buildBlockShuffleSeries(series, seed, blockSize = NULL_BLOCK_SIZE) {
  const atoms = candleAtoms(series);
  const size = Math.max(2, Math.floor(Number(blockSize) || NULL_BLOCK_SIZE));
  const blocks = [];
  for (let i = 0; i < atoms.length; i += size) blocks.push(atoms.slice(i, i + size));
  const ordered = shuffle(blocks, makeRng(seed)).flat();
  return rebuildSeries(series, ordered);
}

function tradeReturnBps(series, entryIndex, exitIndex, side, costBps) {
  const entry = Number(series[entryIndex]?.c);
  const exit = Number(series[exitIndex]?.c);
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || entry <= 0) return null;
  const gross = side === 'LONG'
    ? (exit / entry - 1) * 10000
    : ((entry - exit) / entry) * 10000;
  return {
    entryIndex,
    exitIndex,
    side,
    holdingBars: exitIndex - entryIndex,
    netReturnBps: gross - costBps,
  };
}

function summarizeTrades(trades, startIndex, endIndex) {
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;
  let exposureBars = 0;
  for (const trade of trades) {
    const net = Number(trade.netReturnBps || 0);
    if (net > 0) {
      wins++;
      grossProfit += net;
    } else if (net < 0) {
      grossLoss += Math.abs(net);
    }
    exposureBars += Number(trade.holdingBars || 0);
    equity *= Math.max(0.000001, 1 + net / 10000);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - equity) / peak : 0);
  }
  const count = trades.length;
  const observedBars = Math.max(1, endIndex - startIndex + 1);
  return {
    trades: count,
    returnPct: round((equity - 1) * 100),
    winRatePct: count ? round(wins / count * 100, 1) : 0,
    avgNetBps: count ? round(trades.reduce((sum, trade) => sum + Number(trade.netReturnBps || 0), 0) / count) : 0,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss) : null,
    maxDrawdownPct: round(maxDrawdown * 100),
    exposurePct: round(Math.min(100, exposureBars / observedBars * 100), 1),
  };
}

function buildChampionSignals(series, instrument, startIndex, endIndex) {
  const engine = new ShadowEngine({ seriesProvider: () => series });
  const signals = [];
  for (let idx = startIndex; idx <= endIndex; idx++) {
    const decision = engine.analyze(instrument, idx).entryDecision;
    signals.push(decision === 'ENTER_LONG' ? 'LONG' : decision === 'ENTER_SHORT' ? 'SHORT' : null);
  }
  return signals;
}

function shiftedSignalRun({ series, instrument, startIndex, endIndex, horizonBars, costBps, shiftOffset }) {
  const signalEnd = endIndex - horizonBars;
  const signals = buildChampionSignals(series, instrument, startIndex, signalEnd);
  const span = signals.length;
  const trades = [];
  let nextFreeIndex = startIndex;
  for (let idx = startIndex; idx <= signalEnd; idx++) {
    if (idx < nextFreeIndex) continue;
    const local = idx - startIndex;
    const source = (local + shiftOffset) % span;
    const side = signals[source];
    if (side !== 'LONG' && side !== 'SHORT') continue;
    const exitIndex = idx + horizonBars;
    const trade = tradeReturnBps(series, idx, exitIndex, side, costBps);
    if (!trade) continue;
    trades.push(trade);
    nextFreeIndex = exitIndex + 1;
  }
  return summarizeTrades(trades, startIndex, endIndex);
}

function compactRun(suite) {
  const champion = suite?.results?.find(result => result.id === 'champion');
  if (!champion) return null;
  const bestPanelAvgNetBps = Math.max(...suite.results
    .filter(result => result.id !== 'buy_hold')
    .map(result => Number(result.avgNetBps))
    .filter(Number.isFinite));
  return {
    trades: champion.trades,
    returnPct: champion.returnPct,
    profitFactor: champion.profitFactor,
    avgNetBps: champion.avgNetBps,
    maxDrawdownPct: champion.maxDrawdownPct,
    bestPanelAvgNetBps: Number.isFinite(bestPanelAvgNetBps) ? round(bestPanelAvgNetBps) : null,
  };
}

function summarizeMethod({ id, label, description, runs, realChampion }) {
  const valid = runs.filter(Boolean);
  const avgValues = valid.map(run => Number(run.avgNetBps)).filter(Number.isFinite);
  const returnValues = valid.map(run => Number(run.returnPct)).filter(Number.isFinite);
  const pfValues = valid.map(run => Number(run.profitFactor)).filter(Number.isFinite);
  const bestPanelValues = valid.map(run => Number(run.bestPanelAvgNetBps)).filter(Number.isFinite);
  const realAvg = Number(realChampion?.avgNetBps);
  const exceeding = avgValues.filter(value => Number.isFinite(realAvg) && value >= realAvg).length;
  const p95 = quantile(avgValues, 0.95);
  return {
    id,
    label,
    description,
    replicates: valid.length,
    primaryMetric: 'avgNetBps',
    realChampionAvgNetBps: round(realAvg),
    nullAvgNetBps: {
      median: round(quantile(avgValues, 0.5)),
      p95: round(p95),
      max: round(quantile(avgValues, 1)),
      exceedanceRatePct: valid.length ? round(exceeding / valid.length * 100, 1) : null,
    },
    nullReturnPct: {
      median: round(quantile(returnValues, 0.5)),
      p95: round(quantile(returnValues, 0.95)),
    },
    nullProfitFactor: {
      median: round(quantile(pfValues, 0.5)),
      p95: round(quantile(pfValues, 0.95)),
    },
    bestOfPanelAvgNetBpsP95: round(quantile(bestPanelValues, 0.95)),
    screening: Number.isFinite(realAvg) && Number.isFinite(p95) && realAvg > p95
      ? 'real-above-null95'
      : 'null-overlap',
    distributions: {
      avgNetBps: avgValues.map(value => round(value)),
      returnPct: returnValues.map(value => round(value)),
    },
  };
}

export function runNullMarketControls({
  series,
  endIndex,
  estimatedRoundTripCostBps = 0,
  dataSignature = 'unknown',
  instrument = 'BTCUSD',
  timeframeHours = 4,
  replicates = NULL_CONTROL_REPLICATES,
  blockSize = NULL_BLOCK_SIZE,
  horizonBars = BASELINE_HORIZON_BARS,
  startIndex = BASELINE_START_INDEX,
} = {}) {
  if (!Array.isArray(series) || series.length <= startIndex + horizonBars) {
    return { version: NULL_CONTROL_VERSION, status: 'unavailable', reason: 'insufficient-series', methods: [] };
  }
  const safeEnd = Math.min(Number(endIndex ?? series.length - 1), series.length - 1);
  const reps = Math.max(8, Math.min(64, Math.floor(Number(replicates) || NULL_CONTROL_REPLICATES)));
  const costBps = Math.max(0, Number(estimatedRoundTripCostBps) || 0);
  const realSuite = runBaselineSuite({
    series,
    endIndex: safeEnd,
    estimatedRoundTripCostBps: costBps,
    dataSignature,
    instrument,
    timeframeHours,
    horizonBars,
    startIndex,
  });
  if (realSuite.status !== 'complete') {
    return { version: NULL_CONTROL_VERSION, status: 'unavailable', reason: 'real-baseline-unavailable', methods: [] };
  }
  const realChampion = realSuite.results.find(result => result.id === 'champion');

  const returnRuns = [];
  const blockRuns = [];
  for (let i = 0; i < reps; i++) {
    const returnSeries = buildReturnShuffleSeries(series, `${dataSignature}:return-shuffle:${i}`);
    const returnSuite = runBaselineSuite({
      series: returnSeries,
      endIndex: safeEnd,
      estimatedRoundTripCostBps: costBps,
      dataSignature: `${dataSignature}:null-return:${i}`,
      instrument,
      timeframeHours,
      horizonBars,
      startIndex,
    });
    returnRuns.push(compactRun(returnSuite));

    const blockSeries = buildBlockShuffleSeries(series, `${dataSignature}:block-shuffle:${i}`, blockSize);
    const blockSuite = runBaselineSuite({
      series: blockSeries,
      endIndex: safeEnd,
      estimatedRoundTripCostBps: costBps,
      dataSignature: `${dataSignature}:null-block:${i}`,
      instrument,
      timeframeHours,
      horizonBars,
      startIndex,
    });
    blockRuns.push(compactRun(blockSuite));
  }

  const signalEnd = safeEnd - horizonBars;
  const signalSpan = Math.max(1, signalEnd - startIndex + 1);
  const minimumShift = Math.min(Math.max(horizonBars * 4, 12), Math.max(1, Math.floor(signalSpan / 3)));
  const shiftCandidates = [];
  for (let offset = minimumShift; offset < signalSpan - minimumShift; offset++) shiftCandidates.push(offset);
  const shuffledOffsets = shuffle(shiftCandidates, makeRng(`${dataSignature}:signal-shift-offsets`));
  const signalRuns = [];
  for (let i = 0; i < reps; i++) {
    const offset = shuffledOffsets[i % Math.max(1, shuffledOffsets.length)] || (minimumShift + i) % signalSpan;
    signalRuns.push(shiftedSignalRun({
      series,
      instrument,
      startIndex,
      endIndex: safeEnd,
      horizonBars,
      costBps,
      shiftOffset: offset,
    }));
  }

  const methods = [
    summarizeMethod({
      id: 'return_shuffle',
      label: 'Return Shuffle',
      description: 'リターンとローソク足形状の分布を保ちながら時間順序を壊す。',
      runs: returnRuns,
      realChampion,
    }),
    summarizeMethod({
      id: 'block_shuffle',
      label: 'Block Shuffle',
      description: `${blockSize}バー単位の局所構造を残し、ブロック順序を壊す。`,
      runs: blockRuns,
      realChampion,
    }),
    summarizeMethod({
      id: 'signal_shift',
      label: 'Signal Shift',
      description: '実市場系列はそのままに、Championシグナルと未来Returnの対応だけを循環シフトする。',
      runs: signalRuns,
      realChampion,
    }),
  ];

  const separated = methods.filter(method => method.screening === 'real-above-null95').length;
  return {
    version: NULL_CONTROL_VERSION,
    status: 'complete',
    instrument,
    timeframeHours,
    dataSignature,
    observedBars: safeEnd - startIndex + 1,
    replicatesPerMethod: reps,
    estimatedRoundTripCostBps: round(costBps),
    realChampion: {
      trades: realChampion.trades,
      returnPct: realChampion.returnPct,
      profitFactor: realChampion.profitFactor,
      avgNetBps: realChampion.avgNetBps,
      maxDrawdownPct: realChampion.maxDrawdownPct,
    },
    methodology: {
      purpose: 'negative-control-diagnostic',
      primaryMetric: 'avgNetBps',
      formalPValue: false,
      edgeProof: false,
      optimizer: false,
      parameterSweep: false,
      championMutation: false,
      usedByDecisionEngine: false,
      transformedSeriesInjectedIntoLiveEngine: false,
      deterministicSeeds: true,
      returnShufflePreservesMarginalCandleAtoms: true,
      blockShuffleSizeBars: blockSize,
      signalShiftPreservesRealMarketSeries: true,
      warning: 'Null95 and exceedance rate are screening diagnostics only; they are not formal statistical significance tests.',
    },
    screening: separated === methods.length ? 'separated-candidate' : 'null-overlap',
    separatedMethods: separated,
    methods,
  };
}
