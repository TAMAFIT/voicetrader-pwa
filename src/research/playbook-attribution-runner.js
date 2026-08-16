import { HumanPlaybookEngine, PLAYBOOK_ARCHETYPES, rebuildPlaybookDecision } from '../knowledge/playbook-engine.js';
import { runPlaybookShadow, PLAYBOOK_SHADOW_HORIZON_BARS, PLAYBOOK_SHADOW_START_INDEX, playbookOutcomeBps, playbookSideFromDecision, summarizePlaybookTrades } from './playbook-shadow-runner.js';

export const PLAYBOOK_ATTRIBUTION_VERSION = 'playbook-attribution-0.1';
export const PLAYBOOK_NEGATIVE_CONTROL_LAGS = Object.freeze([5,7,11,13,17,23,29,37]);

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
  const position = Math.max(0, Math.min(sorted.length - 1, (sorted.length - 1) * q));
  const lo = Math.floor(position), hi = Math.ceil(position), w = position - lo;
  return round(sorted[lo] * (1-w) + sorted[hi] * w);
}

function cloneItems(items = []) {
  return items.map(item => ({ ...item, inputs:item.inputs ? { ...item.inputs } : item.inputs }));
}

function variantItems(analysis, variant, analyses) {
  let playbooks = cloneItems(analysis.playbooks);
  let gates = cloneItems(analysis.gates);
  if (variant?.disabledPlaybookId) playbooks = playbooks.filter(item => item.id !== variant.disabledPlaybookId);
  if (variant?.disabledArchetype) playbooks = playbooks.filter(item => item.archetype !== variant.disabledArchetype);
  if (variant?.disabledGateId) gates = gates.filter(item => item.id !== variant.disabledGateId);
  if (variant?.lagArchetype && Number(variant.lagBars) > 0) {
    const source = analyses.get(analysis.idx - Number(variant.lagBars));
    if (!source) return null;
    const lagged = cloneItems(source.playbooks)
      .filter(item => item.archetype === variant.lagArchetype)
      .map(item => ({ ...item, laggedFromIndex:source.idx, lagBars:Number(variant.lagBars) }));
    playbooks = playbooks.filter(item => item.archetype !== variant.lagArchetype).concat(lagged);
  }
  return { playbooks, gates };
}

function simulateVariant({ series, analyses, startIndex, endIndex, horizonBars, costBps, variant = null, verifyFull = false }) {
  const trades = [];
  const decisionCounts = { ENTER_LONG:0, ENTER_SHORT:0, NO_ENTRY:0 };
  let reconstructionMismatches = 0;
  let nextFree = startIndex;
  for (let idx = startIndex; idx + horizonBars <= endIndex; idx++) {
    if (idx < nextFree) continue;
    const analysis = analyses.get(idx);
    if (!analysis || analysis.status !== 'complete') continue;
    const items = variantItems(analysis, variant, analyses);
    if (!items) continue;
    const rebuilt = rebuildPlaybookDecision({ context:analysis.context, playbooks:items.playbooks, gates:items.gates });
    if (verifyFull && rebuilt.entryDecision !== analysis.entryDecision) reconstructionMismatches += 1;
    decisionCounts[rebuilt.entryDecision] = (decisionCounts[rebuilt.entryDecision] || 0) + 1;
    const side = playbookSideFromDecision(rebuilt.entryDecision);
    if (!side) continue;
    const exitIndex = idx + horizonBars;
    const outcome = playbookOutcomeBps(series,idx,exitIndex,side,costBps);
    if (!outcome) continue;
    trades.push({
      entryIndex:idx,
      exitIndex,
      side,
      regime:analysis.context?.regime || 'unknown',
      riskGate:analysis.context?.riskGate || 'unknown',
      playbookScore:rebuilt.aggregation.compositeScore,
      archetypeAgreement:rebuilt.aggregation.archetypeAgreement,
      ...outcome,
    });
    nextFree = exitIndex + 1;
  }
  return {
    summary:summarizePlaybookTrades(trades,startIndex,endIndex,horizonBars),
    decisionCounts,
    reconstructionMismatches,
    trades,
  };
}

function summaryMatches(a,b) {
  const keys = ['trades','returnPct','avgNetBps','winRatePct','profitFactor','maxDrawdownPct','exposurePct'];
  return keys.every(key => {
    if (a?.[key] === null && b?.[key] === null) return true;
    return Number(a?.[key]) === Number(b?.[key]);
  });
}

function sensitivity(reference, ablated) {
  const deltaReturnPct = round(Number(reference.returnPct || 0) - Number(ablated.returnPct || 0));
  const deltaAvgNetBps = round(Number(reference.avgNetBps || 0) - Number(ablated.avgNetBps || 0));
  const refPf = Number(reference.profitFactor), ablPf = Number(ablated.profitFactor);
  const deltaProfitFactor = Number.isFinite(refPf) && Number.isFinite(ablPf) ? round(refPf - ablPf) : null;
  const deltaTrades = Number(reference.trades || 0) - Number(ablated.trades || 0);
  let diagnostic = 'mixed-sensitivity';
  if (deltaAvgNetBps > 0 && deltaReturnPct > 0) diagnostic = 'supportive-sensitivity';
  else if (deltaAvgNetBps < 0 && deltaReturnPct < 0) diagnostic = 'drag-in-sample';
  return { deltaReturnPct, deltaAvgNetBps, deltaProfitFactor, deltaTrades, diagnostic };
}

function nullSummary(values, realValue) {
  const clean = finite(values);
  const median = quantile(clean,.5), p95 = quantile(clean,.95);
  const exceed = clean.length ? clean.filter(value => value >= realValue).length / clean.length * 100 : null;
  return {
    median,
    p95,
    max:clean.length ? round(Math.max(...clean)) : null,
    min:clean.length ? round(Math.min(...clean)) : null,
    exceedanceRatePct:round(exceed,1),
    finiteReplicates:clean.length,
  };
}

export function runPlaybookAttribution({
  series,
  endIndex,
  estimatedRoundTripCostBps = 0,
  dataSignature = 'unknown',
  startIndex = PLAYBOOK_SHADOW_START_INDEX,
  horizonBars = PLAYBOOK_SHADOW_HORIZON_BARS,
} = {}) {
  const maxLag = Math.max(...PLAYBOOK_NEGATIVE_CONTROL_LAGS);
  if (!Array.isArray(series) || series.length <= startIndex + maxLag + horizonBars) {
    return { version:PLAYBOOK_ATTRIBUTION_VERSION,status:'unavailable',reason:'insufficient-series' };
  }
  const sourceBefore = JSON.stringify(series);
  const safeEnd = Math.min(Number(endIndex ?? series.length - 1),series.length - 1);
  const engine = new HumanPlaybookEngine();
  const analyses = new Map();
  for (let idx = Math.max(55,startIndex - maxLag); idx <= safeEnd; idx++) {
    const analysis = engine.analyze(series,idx);
    if (analysis.status === 'complete') analyses.set(idx,analysis);
  }
  const canonical = runPlaybookShadow({ series,endIndex:safeEnd,estimatedRoundTripCostBps,dataSignature,startIndex,horizonBars });
  if (canonical.status !== 'complete') return { version:PLAYBOOK_ATTRIBUTION_VERSION,status:'blocked',reason:`canonical-${canonical.reason || canonical.status}` };
  const reconstructed = simulateVariant({ series,analyses,startIndex,endIndex:safeEnd,horizonBars,costBps:estimatedRoundTripCostBps,verifyFull:true });
  if (reconstructed.reconstructionMismatches > 0 || !summaryMatches(reconstructed.summary,canonical.summary)) {
    return { version:PLAYBOOK_ATTRIBUTION_VERSION,status:'blocked',reason:'playbook-decision-reconstruction-mismatch',reconstructionMismatches:reconstructed.reconstructionMismatches };
  }

  const latest = analyses.get(safeEnd) || [...analyses.values()].at(-1);
  const allAlphaMeta = latest.playbooks.map(item => ({ id:item.id,label:item.label,archetype:item.archetype }));
  const gateMeta = latest.gates.map(item => ({ id:item.id,label:item.label }));
  const playbookAblations = allAlphaMeta.map(meta => {
    const result = simulateVariant({ series,analyses,startIndex,endIndex:safeEnd,horizonBars,costBps:estimatedRoundTripCostBps,variant:{ disabledPlaybookId:meta.id } });
    return { ...meta,ablatedSummary:result.summary,...sensitivity(canonical.summary,result.summary) };
  }).sort((a,b) => Number(b.deltaAvgNetBps || 0) - Number(a.deltaAvgNetBps || 0));

  const archetypeAblations = PLAYBOOK_ARCHETYPES.map(archetype => {
    const result = simulateVariant({ series,analyses,startIndex,endIndex:safeEnd,horizonBars,costBps:estimatedRoundTripCostBps,variant:{ disabledArchetype:archetype } });
    return { archetype,ablatedSummary:result.summary,...sensitivity(canonical.summary,result.summary) };
  });

  const gateAblations = gateMeta.map(meta => {
    const result = simulateVariant({ series,analyses,startIndex,endIndex:safeEnd,horizonBars,costBps:estimatedRoundTripCostBps,variant:{ disabledGateId:meta.id } });
    return { ...meta,ablatedSummary:result.summary,...sensitivity(canonical.summary,result.summary) };
  });

  const nullStartIndex = startIndex + maxLag;
  const fullNullWindow = simulateVariant({ series,analyses,startIndex:nullStartIndex,endIndex:safeEnd,horizonBars,costBps:estimatedRoundTripCostBps });
  const negativeControls = PLAYBOOK_ARCHETYPES.map(archetype => {
    const replicates = PLAYBOOK_NEGATIVE_CONTROL_LAGS.map(lagBars => {
      const result = simulateVariant({ series,analyses,startIndex:nullStartIndex,endIndex:safeEnd,horizonBars,costBps:estimatedRoundTripCostBps,variant:{ lagArchetype:archetype,lagBars } });
      return { lagBars,trades:result.summary.trades,returnPct:result.summary.returnPct,avgNetBps:result.summary.avgNetBps,profitFactor:result.summary.profitFactor };
    });
    const avgStats = nullSummary(replicates.map(item => item.avgNetBps),Number(fullNullWindow.summary.avgNetBps || 0));
    const returnStats = nullSummary(replicates.map(item => item.returnPct),Number(fullNullWindow.summary.returnPct || 0));
    const separated = Number.isFinite(Number(avgStats.p95)) && Number(fullNullWindow.summary.avgNetBps || 0) > Number(avgStats.p95);
    return {
      archetype,
      referenceSummary:fullNullWindow.summary,
      replicates,
      avgNetBpsNull:avgStats,
      returnPctNull:returnStats,
      screening:separated ? 'aligned-above-null95' : 'null-overlap',
    };
  });

  const archetypeResults = archetypeAblations.map(item => {
    const negativeControl = negativeControls.find(control => control.archetype === item.archetype);
    let diagnostic = item.diagnostic;
    if (item.deltaAvgNetBps > 0 && item.deltaReturnPct > 0 && negativeControl?.screening === 'aligned-above-null95') diagnostic = 'supportive-and-time-aligned';
    else if (item.deltaAvgNetBps > 0 && item.deltaReturnPct > 0) diagnostic = 'supportive-ablation-null-overlap';
    return { ...item,negativeControl,diagnostic };
  }).sort((a,b) => Number(b.deltaAvgNetBps || 0) - Number(a.deltaAvgNetBps || 0));

  if (JSON.stringify(series) !== sourceBefore) return { version:PLAYBOOK_ATTRIBUTION_VERSION,status:'blocked',reason:'source-series-mutated' };

  return {
    version:PLAYBOOK_ATTRIBUTION_VERSION,
    status:'complete',
    dataSignature,
    startIndex,
    endIndex:safeEnd,
    horizonBars,
    estimatedRoundTripCostBps:round(estimatedRoundTripCostBps),
    referenceSummary:canonical.summary,
    playbookAblations,
    archetypeAblations:archetypeResults,
    gateAblations,
    regimeMetrics:canonical.summary.regimeMetrics,
    negativeControl:{
      method:'past-signal-lag-by-playbook-archetype',
      lagsBars:[...PLAYBOOK_NEGATIVE_CONTROL_LAGS],
      startIndex:nullStartIndex,
      referenceSummary:fullNullWindow.summary,
      archetypes:negativeControls,
    },
    methodology:{
      purpose:'research-only-playbook-attribution',
      leaveOnePlaybookOut:true,
      leaveOneArchetypeOut:true,
      gateAblation:true,
      causalAttribution:false,
      nullUsesPastSignalsOnly:true,
      nullPreservesMarketSeries:true,
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
