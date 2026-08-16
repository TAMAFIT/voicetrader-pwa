import { getLatestWalkForwardEvaluation } from './walk-forward-state.js';
import { getLatestForwardDemoEvaluation } from './forward-demo-state.js';
import { getLatestKnowledgeEvaluation } from './knowledge-state.js';

export const RESEARCH_EXPORT_VERSION = 'research-export-0.7';
export const PREVIOUS_RESEARCH_EXPORT_VERSION = 'research-export-0.6';

const round = (value, digits = 4) => {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

function expertScore(event, id) {
  return event?.experts?.find(expert => expert.id === id)?.score ?? '';
}

function counterfactualOutcome(event, horizonBars) {
  return event?.counterfactual?.outcomes?.find(outcome => outcome.horizonBars === horizonBars) || null;
}

function safeSpreadsheetText(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value) {
  const text = safeSpreadsheetText(value).replaceAll('"', '""');
  return `"${text}"`;
}

export function flattenDecisionEvent(event) {
  const cf1 = counterfactualOutcome(event, 1);
  const cf3 = counterfactualOutcome(event, 3);
  const cf6 = counterfactualOutcome(event, 6);
  return {
    eventId: event?.eventId || '',
    recordedAt: event?.recordedAt || '',
    strategyVersion: event?.strategyVersion || '',
    instrument: event?.instrument || '',
    timeframeHours: event?.timeframeHours || '',
    candleTime: event?.candleTime || '',
    barIndex: event?.barIndex ?? '',
    dataSourceId: event?.dataSourceId || '',
    dataSourceType: event?.dataSourceType || '',
    dataSignature: event?.dataSignature || '',
    researchEligible: event?.researchEligible ?? '',
    engineVersion: event?.engineVersion || '',
    expertSetVersion: event?.expertSetVersion || '',
    regime: event?.regime || '',
    marketPrice: round(event?.market?.price),
    fastMA: round(event?.market?.fastMA),
    slowMA: round(event?.market?.slowMA),
    rsi: round(event?.market?.rsi),
    atrPct: round(event?.market?.atrPct),
    rawAlphaScore: round(event?.scores?.rawAlphaScore),
    decisionScore: round(event?.scores?.decisionScore),
    confidenceScore: round(event?.scores?.confidenceScore),
    timingScore: round(event?.scores?.timingScore),
    riskScore: round(event?.scores?.riskScore),
    estimatedRoundTripCostBps: round(event?.costs?.estimatedRoundTripCostBps),
    entryDecision: event?.entryDecision || '',
    policyDecision: event?.policyDecision || '',
    legacyAction: event?.legacyAction || '',
    trendExpertScore: round(expertScore(event, 'trend')),
    momentumExpertScore: round(expertScore(event, 'momentum')),
    breakoutExpertScore: round(expertScore(event, 'breakout')),
    cfLong1NetBps: round(cf1?.long?.netReturnBps),
    cfShort1NetBps: round(cf1?.short?.netReturnBps),
    cfLong3NetBps: round(cf3?.long?.netReturnBps),
    cfShort3NetBps: round(cf3?.short?.netReturnBps),
    cfLong6NetBps: round(cf6?.long?.netReturnBps),
    cfShort6NetBps: round(cf6?.short?.netReturnBps),
    cfLong3MfeBps: round(cf3?.longMfeBps),
    cfLong3MaeBps: round(cf3?.longMaeBps),
    cfShort3MfeBps: round(cf3?.shortMfeBps),
    cfShort3MaeBps: round(cf3?.shortMaeBps),
    counterfactualStatus: event?.counterfactual?.status || '',
  };
}

export function researchEventsToCsv(events = []) {
  const rows = events.map(flattenDecisionEvent);
  const headers = Object.keys(flattenDecisionEvent({}));
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(headers.map(header => csvCell(row[header])).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
}

export function buildResearchJson({
  events = [],
  baselineEvaluation = null,
  strategyRegistry = null,
  challengerEvaluation = null,
  walkForwardEvaluation = undefined,
  forwardDemoEvaluation = undefined,
  knowledgeEvaluation = undefined,
  nullMarketEvaluation = null,
  dataMeta = null,
} = {}) {
  const resolvedWalkForward = walkForwardEvaluation === undefined
    ? getLatestWalkForwardEvaluation()
    : walkForwardEvaluation;
  const resolvedForwardDemo = forwardDemoEvaluation === undefined
    ? getLatestForwardDemoEvaluation()
    : forwardDemoEvaluation;
  const resolvedKnowledge = knowledgeEvaluation === undefined
    ? getLatestKnowledgeEvaluation()
    : knowledgeEvaluation;
  return JSON.stringify({
    exportVersion: RESEARCH_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    eventCount: events.length,
    notes: [
      'DecisionEvent counterfactual outcomes from the same event are clustered observations and are not IID samples.',
      'Baseline evaluation is a descriptive same-series comparator and is not proof of a reproducible edge.',
      'Strategy Registry Challenger results are same-series Shadow diagnostics only and cannot automatically promote or mutate the frozen Champion.',
      'Human Trading Knowledge Engine Wave 1 is a same-series research-only candidate layer. Its Knowledge score is neither expected return nor a calibrated probability, and it does not mutate Champion, Live Forward, or Forward Evidence.',
      'Human Knowledge directional rules are normalized by family before the composite so adding many correlated rules to one family does not automatically increase that family weighting; regime and risk diagnostics do not cast directional votes.',
      'Knowledge Attribution uses leave-one-Expert-out and leave-one-Family-out sensitivity diagnostics. Positive deltas mean removing that element worsened the same-series result; this is not causal attribution and never triggers automatic pruning or weighting changes.',
      'Family Knowledge Negative Controls lag only the target family using past signals while preserving the market series, other families, and current risk/regime context. Null95 and exceedance rates are screening diagnostics, not formal p-values.',
      'Chronological walk-forward uses frozen strategies, three ordered test folds, and a 3-bar embargo with no fitting; because this historical series has already been inspected by same-series research views, it is a holdout diagnostic rather than pristine untouched OOS proof.',
      'Prospective Forward Demo epoch forward-001 is frozen at 2026-08-16T14:27:00Z; only fully closed 4H candles whose open timestamp is strictly after that boundary may contribute Forward P&L evidence.',
      'Forward evidence is stored locally in this browser and deduplicated by epoch/strategy/entry/exit key. Clearing site storage can remove the local archive, so JSON exports should be retained for durable evidence.',
      'Forward Demo evidence is necessary but not sufficient for future Champion promotion; negative-control review and human approval remain required.',
      'Null Market / Negative Control results are screening diagnostics only; Null95 and exceedance rates are not formal p-values or proof of statistical significance.',
      'Null-transformed series, Human Knowledge outputs, Knowledge Attribution outputs, Challenger outputs, walk-forward diagnostics, Forward Demo diagnostics, and signal-shift outcomes are never inputs to the frozen live/demo Champion decision engine.',
      'Synthetic market data is not research eligible.',
    ],
    dataMeta,
    baselineEvaluation,
    strategyRegistry,
    challengerEvaluation,
    knowledgeEvaluation: resolvedKnowledge,
    walkForwardEvaluation: resolvedWalkForward,
    forwardDemoEvaluation: resolvedForwardDemo,
    nullMarketEvaluation,
    decisionEvents: events,
  }, null, 2);
}

export function downloadResearchText({ filename, text, mimeType }) {
  const blob = new Blob([text], { type:mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
