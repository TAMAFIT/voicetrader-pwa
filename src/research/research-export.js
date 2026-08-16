export const RESEARCH_EXPORT_VERSION = 'research-export-0.1';

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

export function buildResearchJson({ events = [], baselineEvaluation = null, dataMeta = null } = {}) {
  return JSON.stringify({
    exportVersion: RESEARCH_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    eventCount: events.length,
    notes: [
      'DecisionEvent counterfactual outcomes from the same event are clustered observations and are not IID samples.',
      'Baseline evaluation is a descriptive same-series comparator and is not proof of a reproducible edge.',
      'Synthetic market data is not research eligible.',
    ],
    dataMeta,
    baselineEvaluation,
    decisionEvents: events,
  }, null, 2);
}

export function downloadResearchText({ filename, text, mimeType }) {
  const blob = new Blob([text], { type: mimeType });
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
