import { HumanPlaybookEngine, HUMAN_PLAYBOOK_ENGINE_VERSION } from '../knowledge/playbook-engine.js';

export const PLAYBOOK_SHADOW_VERSION = 'playbook-shadow-0.1';
export const PLAYBOOK_SHADOW_HORIZON_BARS = 3;
export const PLAYBOOK_SHADOW_START_INDEX = 110;

const round = (value, digits = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

export function playbookSideFromDecision(decision) {
  if (decision === 'ENTER_LONG') return 'LONG';
  if (decision === 'ENTER_SHORT') return 'SHORT';
  return null;
}

export function playbookOutcomeBps(series, entryIndex, exitIndex, side, costBps) {
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
    netReturnBps:round(gross - Math.max(0, Number(costBps) || 0)),
  };
}

export function summarizePlaybookTrades(trades = [], startIndex = 0, endIndex = 0, horizonBars = PLAYBOOK_SHADOW_HORIZON_BARS) {
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  let wins = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  const regimeCounts = {};
  const regimeNet = {};
  for (const trade of trades) {
    const net = Number(trade.netReturnBps || 0);
    if (net > 0) { wins++; grossProfit += net; }
    if (net < 0) grossLoss += Math.abs(net);
    equity *= Math.max(.000001, 1 + net / 10000);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - equity) / peak : 0);
    const regime = trade.regime || 'unknown';
    regimeCounts[regime] = (regimeCounts[regime] || 0) + 1;
    regimeNet[regime] = (regimeNet[regime] || 0) + net;
  }
  const count = trades.length;
  const observedBars = Math.max(1, endIndex - startIndex + 1);
  const regimeMetrics = Object.fromEntries(Object.entries(regimeCounts).map(([regime, tradesCount]) => [regime, {
    trades:tradesCount,
    avgNetBps:round(regimeNet[regime] / Math.max(1,tradesCount)),
  }]));
  return {
    trades:count,
    returnPct:round((equity - 1) * 100),
    avgNetBps:count ? round(trades.reduce((sum, trade) => sum + Number(trade.netReturnBps || 0),0) / count) : 0,
    winRatePct:count ? round(wins / count * 100,1) : 0,
    profitFactor:grossLoss > 0 ? round(grossProfit / grossLoss) : null,
    maxDrawdownPct:round(maxDrawdown * 100),
    exposurePct:round(Math.min(100, count * horizonBars / observedBars * 100),1),
    regimeCounts,
    regimeMetrics,
  };
}

export function runPlaybookShadow({
  series,
  endIndex,
  estimatedRoundTripCostBps = 0,
  dataSignature = 'unknown',
  startIndex = PLAYBOOK_SHADOW_START_INDEX,
  horizonBars = PLAYBOOK_SHADOW_HORIZON_BARS,
} = {}) {
  if (!Array.isArray(series) || series.length <= startIndex + horizonBars) {
    return { version:PLAYBOOK_SHADOW_VERSION,status:'unavailable',reason:'insufficient-series',trades:[] };
  }
  const sourceBefore = JSON.stringify(series);
  const safeEnd = Math.min(Number(endIndex ?? series.length - 1), series.length - 1);
  const engine = new HumanPlaybookEngine();
  const trades = [];
  const decisionCounts = { ENTER_LONG:0, ENTER_SHORT:0, NO_ENTRY:0 };
  const gateCounts = {};
  let nextFree = startIndex;

  for (let idx = startIndex; idx + horizonBars <= safeEnd; idx++) {
    if (idx < nextFree) continue;
    const analysis = engine.analyze(series, idx);
    if (analysis.status !== 'complete') continue;
    decisionCounts[analysis.entryDecision] = (decisionCounts[analysis.entryDecision] || 0) + 1;
    if (analysis.gateReason) gateCounts[analysis.gateReason] = (gateCounts[analysis.gateReason] || 0) + 1;
    const side = playbookSideFromDecision(analysis.entryDecision);
    if (!side) continue;
    const exitIndex = idx + horizonBars;
    const outcome = playbookOutcomeBps(series, idx, exitIndex, side, estimatedRoundTripCostBps);
    if (!outcome) continue;
    trades.push({
      entryIndex:idx,
      exitIndex,
      entryTime:Number(series[idx]?.t) || null,
      exitTime:Number(series[exitIndex]?.t) || null,
      holdingBars:horizonBars,
      side,
      regime:analysis.context?.regime || 'unknown',
      riskGate:analysis.context?.riskGate || 'unknown',
      playbookScore:analysis.playbookScore,
      archetypeAgreement:analysis.archetypeAgreement,
      activePlaybookIds:analysis.playbooks.filter(item => item.active).map(item => item.id),
      archetypeScores:Object.fromEntries(Object.entries(analysis.archetypes).map(([key,value]) => [key,value.score])),
      ...outcome,
    });
    nextFree = exitIndex + 1;
  }

  if (JSON.stringify(series) !== sourceBefore) {
    return { version:PLAYBOOK_SHADOW_VERSION,status:'blocked',reason:'source-series-mutated',trades:[] };
  }

  return {
    version:PLAYBOOK_SHADOW_VERSION,
    engineVersion:HUMAN_PLAYBOOK_ENGINE_VERSION,
    status:'complete',
    dataSignature,
    startIndex,
    endIndex:safeEnd,
    horizonBars,
    estimatedRoundTripCostBps:round(estimatedRoundTripCostBps),
    decisionCounts,
    gateCounts,
    summary:summarizePlaybookTrades(trades,startIndex,safeEnd,horizonBars),
    trades,
    methodology:{
      purpose:'research-only-human-trading-playbook-shadow',
      wave:2,
      fixedHorizonBars:horizonBars,
      nonOverlappingTrades:true,
      regimeRouted:true,
      equalArchetypeNormalization:true,
      scoreIsExpectedReturn:false,
      scoreIsCalibratedProbability:false,
      optimizer:false,
      parameterSweep:false,
      selfLearning:false,
      adaptiveWeights:false,
      automaticPruning:false,
      automaticPromotion:false,
      championMutation:false,
      usedByLiveDecisionEngine:false,
      usedByForwardEvidence:false,
      sameSeriesDiagnosticOnly:true,
    },
  };
}
