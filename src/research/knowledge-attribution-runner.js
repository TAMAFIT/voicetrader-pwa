import { HumanKnowledgeEngine } from '../knowledge/human-knowledge-engine.js';
import { aggregateFamilies, DIRECTIONAL_FAMILIES } from '../knowledge/expert-library.js';
import { runKnowledgeShadow, KNOWLEDGE_SHADOW_HORIZON_BARS, KNOWLEDGE_SHADOW_START_INDEX } from './knowledge-shadow-runner.js';

export const KNOWLEDGE_ATTRIBUTION_VERSION = 'knowledge-attribution-0.1';
export const FAMILY_NEGATIVE_CONTROL_LAGS = Object.freeze([7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]);

const round = (value, digits = 2) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

const finite = values => values.map(Number).filter(Number.isFinite);

function quantile(values, q) {
  const sorted = finite(values).sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return round(sorted[0]);
  const pos = Math.max(0, Math.min(sorted.length - 1, (sorted.length - 1) * q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const weight = pos - lo;
  return round(sorted[lo] * (1 - weight) + sorted[hi] * weight);
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
    grossReturnBps: round(gross),
    netReturnBps: round(gross - Math.max(0, Number(costBps) || 0)),
  };
}

function summarize(trades, startIndex, endIndex, horizonBars) {
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  let wins = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  const regimeCounts = {};
  for (const trade of trades) {
    const net = Number(trade.netReturnBps || 0);
    if (net > 0) { wins++; grossProfit += net; }
    if (net < 0) grossLoss += Math.abs(net);
    equity *= Math.max(.000001, 1 + net / 10000);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - equity) / peak : 0);
    regimeCounts[trade.regime] = (regimeCounts[trade.regime] || 0) + 1;
  }
  const count = trades.length;
  const observedBars = Math.max(1, endIndex - startIndex + 1);
  return {
    trades: count,
    returnPct: round((equity - 1) * 100),
    avgNetBps: count ? round(trades.reduce((sum, trade) => sum + Number(trade.netReturnBps || 0), 0) / count) : 0,
    winRatePct: count ? round(wins / count * 100, 1) : 0,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss) : null,
    maxDrawdownPct: round(maxDrawdown * 100),
    exposurePct: round(Math.min(100, count * horizonBars / observedBars * 100), 1),
    regimeCounts,
  };
}

function decisionFromExperts(analysis, experts) {
  const aggregation = aggregateFamilies(experts);
  const compositeScore = aggregation.compositeScore;
  const familyAgreement = aggregation.familyAgreement;
  let entryDecision = 'NO_ENTRY';
  if (analysis.context?.riskGate !== 'BLOCK') {
    if (compositeScore >= 22 && familyAgreement >= .5) entryDecision = 'ENTER_LONG';
    else if (compositeScore <= -22 && familyAgreement >= .5) entryDecision = 'ENTER_SHORT';
  }
  return { entryDecision, aggregation };
}

function buildVariantExperts(analysis, variant, analyses) {
  let experts = analysis.experts.map(item => ({ ...item }));
  if (variant?.disabledExpertId) {
    experts = experts.filter(item => item.id !== variant.disabledExpertId);
  }
  if (variant?.disabledFamily) {
    experts = experts.filter(item => item.family !== variant.disabledFamily);
  }
  if (variant?.lagFamily && Number(variant.lagBars) > 0) {
    const source = analyses.get(analysis.idx - Number(variant.lagBars));
    if (!source) return null;
    const lagged = source.experts
      .filter(item => item.family === variant.lagFamily)
      .map(item => ({ ...item, laggedFromIndex:source.idx, lagBars:Number(variant.lagBars) }));
    experts = experts.filter(item => item.family !== variant.lagFamily).concat(lagged);
  }
  return experts;
}

function simulateVariant({ series, analyses, startIndex, endIndex, horizonBars, costBps, variant = null, verifyFull = false }) {
  const trades = [];
  const decisionCounts = { ENTER_LONG:0, ENTER_SHORT:0, NO_ENTRY:0 };
  let nextFree = startIndex;
  let reconstructionMismatches = 0;
  for (let idx = startIndex; idx + horizonBars <= endIndex; idx++) {
    if (idx < nextFree) continue;
    const analysis = analyses.get(idx);
    if (!analysis || analysis.status !== 'complete') continue;
    const experts = buildVariantExperts(analysis, variant, analyses);
    if (!experts) continue;
    const rebuilt = decisionFromExperts(analysis, experts);
    if (verifyFull && rebuilt.entryDecision !== analysis.entryDecision) reconstructionMismatches++;
    decisionCounts[rebuilt.entryDecision] = (decisionCounts[rebuilt.entryDecision] || 0) + 1;
    const side = sideFromDecision(rebuilt.entryDecision);
    if (!side) continue;
    const exitIndex = idx + horizonBars;
    const outcome = outcomeBps(series, idx, exitIndex, side, costBps);
    if (!outcome) continue;
    trades.push({
      entryIndex: idx,
      exitIndex,
      side,
      regime: analysis.context?.regime || 'unknown',
      knowledgeScore: rebuilt.aggregation.compositeScore,
      familyAgreement: rebuilt.aggregation.familyAgreement,
      ...outcome,
    });
    nextFree = exitIndex + 1;
  }
  return {
    summary: summarize(trades, startIndex, endIndex, horizonBars),
    decisionCounts,
    reconstructionMismatches,
  };
}

function summaryMatches(a, b) {
  const keys = ['trades','returnPct','avgNetBps','winRatePct','profitFactor','maxDrawdownPct','exposurePct'];
  return keys.every(key => {
    if (a?.[key] === null && b?.[key] === null) return true;
    return Number(a?.[key]) === Number(b?.[key]);
  });
}

function sensitivity(reference, ablated) {
  const deltaReturnPct = round(Number(reference.returnPct || 0) - Number(ablated.returnPct || 0));
  const deltaAvgNetBps = round(Number(reference.avgNetBps || 0) - Number(ablated.avgNetBps || 0));
  const refPf = Number(reference.profitFactor);
  const ablPf = Number(ablated.profitFactor);
  const deltaProfitFactor = Number.isFinite(refPf) && Number.isFinite(ablPf) ? round(refPf - ablPf) : null;
  const deltaTrades = Number(reference.trades || 0) - Number(ablated.trades || 0);
  let diagnostic = 'mixed-sensitivity';
  if (deltaAvgNetBps > 0 && deltaReturnPct > 0) diagnostic = 'supportive-sensitivity';
  else if (deltaAvgNetBps < 0 && deltaReturnPct < 0) diagnostic = 'drag-in-sample';
  return { deltaReturnPct, deltaAvgNetBps, deltaProfitFactor, deltaTrades, diagnostic };
}

function nullSummary(values, realValue) {
  const clean = finite(values);
  const median = quantile(clean, .5);
  const p95 = quantile(clean, .95);
  const exceed = clean.length ? clean.filter(value => value >= realValue).length / clean.length * 100 : null;
  return {
    median,
    p95,
    max: clean.length ? round(Math.max(...clean)) : null,
    min: clean.length ? round(Math.min(...clean)) : null,
    exceedanceRatePct: round(exceed, 1),
    finiteReplicates: clean.length,
  };
}

export function runKnowledgeAttribution({
  series,
  endIndex,
  estimatedRoundTripCostBps = 0,
  dataSignature = 'unknown',
  startIndex = KNOWLEDGE_SHADOW_START_INDEX,
  horizonBars = KNOWLEDGE_SHADOW_HORIZON_BARS,
} = {}) {
  const maxLag = Math.max(...FAMILY_NEGATIVE_CONTROL_LAGS);
  if (!Array.isArray(series) || series.length <= startIndex + maxLag + horizonBars) {
    return { version:KNOWLEDGE_ATTRIBUTION_VERSION, status:'unavailable', reason:'insufficient-series' };
  }
  const sourceBefore = JSON.stringify(series);
  const safeEnd = Math.min(Number(endIndex ?? series.length - 1), series.length - 1);
  const engine = new HumanKnowledgeEngine();
  const analyses = new Map();
  for (let idx = startIndex; idx <= safeEnd; idx++) {
    const analysis = engine.analyze(series, idx);
    if (analysis.status === 'complete') analyses.set(idx, analysis);
  }
  if (!analyses.size) return { version:KNOWLEDGE_ATTRIBUTION_VERSION, status:'unavailable', reason:'no-complete-analysis' };

  const canonicalShadow = runKnowledgeShadow({
    series,
    endIndex:safeEnd,
    estimatedRoundTripCostBps,
    dataSignature,
    startIndex,
    horizonBars,
  });
  if (canonicalShadow.status !== 'complete') {
    return { version:KNOWLEDGE_ATTRIBUTION_VERSION, status:'blocked', reason:`canonical-shadow-${canonicalShadow.reason || canonicalShadow.status}` };
  }

  const reconstructed = simulateVariant({
    series, analyses, startIndex, endIndex:safeEnd, horizonBars,
    costBps:estimatedRoundTripCostBps, verifyFull:true,
  });
  if (reconstructed.reconstructionMismatches > 0 || !summaryMatches(reconstructed.summary, canonicalShadow.summary)) {
    return {
      version:KNOWLEDGE_ATTRIBUTION_VERSION,
      status:'blocked',
      reason:'knowledge-decision-reconstruction-mismatch',
      reconstructionMismatches:reconstructed.reconstructionMismatches,
    };
  }

  const first = analyses.values().next().value;
  const expertIds = first.experts.map(item => ({ id:item.id, label:item.label, family:item.family }));
  const expertAblations = expertIds.map(meta => {
    const result = simulateVariant({
      series, analyses, startIndex, endIndex:safeEnd, horizonBars,
      costBps:estimatedRoundTripCostBps,
      variant:{ disabledExpertId:meta.id },
    });
    return { ...meta, ablatedSummary:result.summary, ...sensitivity(canonicalShadow.summary, result.summary) };
  }).sort((a, b) => Number(b.deltaAvgNetBps || 0) - Number(a.deltaAvgNetBps || 0));

  const familyAblations = DIRECTIONAL_FAMILIES.map(family => {
    const result = simulateVariant({
      series, analyses, startIndex, endIndex:safeEnd, horizonBars,
      costBps:estimatedRoundTripCostBps,
      variant:{ disabledFamily:family },
    });
    return { family, ablatedSummary:result.summary, ...sensitivity(canonicalShadow.summary, result.summary) };
  });

  const nullStartIndex = startIndex + maxLag;
  const fullNullWindow = simulateVariant({
    series, analyses, startIndex:nullStartIndex, endIndex:safeEnd, horizonBars,
    costBps:estimatedRoundTripCostBps,
  });
  const familyNegativeControls = DIRECTIONAL_FAMILIES.map(family => {
    const replicates = FAMILY_NEGATIVE_CONTROL_LAGS.map(lagBars => {
      const result = simulateVariant({
        series, analyses, startIndex:nullStartIndex, endIndex:safeEnd, horizonBars,
        costBps:estimatedRoundTripCostBps,
        variant:{ lagFamily:family, lagBars },
      });
      return {
        lagBars,
        trades:result.summary.trades,
        returnPct:result.summary.returnPct,
        avgNetBps:result.summary.avgNetBps,
        profitFactor:result.summary.profitFactor,
      };
    });
    const avgDistribution = replicates.map(item => item.avgNetBps);
    const returnDistribution = replicates.map(item => item.returnPct);
    const avgStats = nullSummary(avgDistribution, Number(fullNullWindow.summary.avgNetBps || 0));
    const returnStats = nullSummary(returnDistribution, Number(fullNullWindow.summary.returnPct || 0));
    const separated = Number.isFinite(Number(avgStats.p95)) && Number(fullNullWindow.summary.avgNetBps || 0) > Number(avgStats.p95);
    return {
      family,
      referenceSummary:fullNullWindow.summary,
      replicates,
      avgNetBpsNull:avgStats,
      returnPctNull:returnStats,
      screening:separated ? 'aligned-above-null95' : 'null-overlap',
    };
  });

  const familyResults = familyAblations.map(item => {
    const negativeControl = familyNegativeControls.find(control => control.family === item.family);
    let diagnostic = item.diagnostic;
    if (item.deltaAvgNetBps > 0 && item.deltaReturnPct > 0 && negativeControl?.screening === 'aligned-above-null95') {
      diagnostic = 'supportive-and-time-aligned';
    } else if (item.deltaAvgNetBps > 0 && item.deltaReturnPct > 0) {
      diagnostic = 'supportive-ablation-null-overlap';
    }
    return { ...item, negativeControl, diagnostic };
  }).sort((a, b) => Number(b.deltaAvgNetBps || 0) - Number(a.deltaAvgNetBps || 0));

  if (JSON.stringify(series) !== sourceBefore) {
    return { version:KNOWLEDGE_ATTRIBUTION_VERSION, status:'blocked', reason:'source-series-mutated' };
  }

  return {
    version: KNOWLEDGE_ATTRIBUTION_VERSION,
    status: 'complete',
    dataSignature,
    startIndex,
    endIndex: safeEnd,
    horizonBars,
    estimatedRoundTripCostBps: round(estimatedRoundTripCostBps),
    referenceSummary: canonicalShadow.summary,
    expertAblations,
    familyAblations: familyResults,
    familyNegativeControl: {
      method:'past-signal-lag-by-family',
      lagsBars:[...FAMILY_NEGATIVE_CONTROL_LAGS],
      startIndex:nullStartIndex,
      referenceSummary:fullNullWindow.summary,
      families:familyNegativeControls,
    },
    methodology: {
      purpose:'research-only-knowledge-attribution',
      leaveOneExpertOut:true,
      leaveOneFamilyOut:true,
      causalAttribution:false,
      familyNullUsesPastSignalsOnly:true,
      familyNullPreservesMarketSeries:true,
      familyNullChangesOnlyTargetFamilyAlignment:true,
      formalPValue:false,
      sameSeriesDiagnosticOnly:true,
      automaticPruning:false,
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
