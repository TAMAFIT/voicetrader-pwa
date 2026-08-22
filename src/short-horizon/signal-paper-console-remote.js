export const SHORT_HORIZON_SIGNAL_PAPER_CONSOLE_REMOTE_VERSION = 'short-horizon-signal-paper-console-remote-v1';
export const SHORT_HORIZON_SIGNAL_MANIFEST_URL = 'https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/short-horizon-signal-data/data/short-horizon-signals/manifest.json';
export const GMO_FX_QUOTE_MANIFEST_URL = 'https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/short-horizon-gmo-quote-data/data/short-horizon-gmo-quotes/manifest.json';
export const GMO_FX_PAPER_MANIFEST_URL = 'https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/short-horizon-gmo-paper-data/data/short-horizon-gmo-paper/manifest.json';

const RAW_ROOT = 'https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa';
const SIGNAL_BRANCH = 'short-horizon-signal-data';
const PAPER_BRANCH = 'short-horizon-gmo-paper-data';
const SIGNAL_SCHEMA = 'short-horizon-signal-manifest-v1';
const QUOTE_SCHEMA = 'gmo-fx-quote-manifest-v1';
const PAPER_SCHEMA = 'gmo-fx-paper-manifest-v1';
const SIGNAL_RECORD_SCHEMA = 'short-horizon-signal-v1';
const PAPER_RECORD_SCHEMA = 'gmo-fx-paper-execution-v1';

function dateParts(ms) {
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toISOString().slice(0, 10);
  return { year: day.slice(0, 4), month: day.slice(5, 7), day };
}

function shiftUtcDay(day, offsetDays) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(offsetDays));
  return d.toISOString().slice(0, 10);
}

export function buildSignalArchiveUrl(timeframeMinutes, sourceTimestampMs) {
  const p = dateParts(sourceTimestampMs);
  if (!p) return null;
  return `${RAW_ROOT}/${SIGNAL_BRANCH}/data/short-horizon-signals/fx/USDJPY/${Number(timeframeMinutes)}m/${p.year}/${p.month}/${p.day}.ndjson`;
}

export function buildPaperArchiveUrl(timeframeMinutes, day) {
  const p = dateParts(Date.parse(`${day}T00:00:00Z`));
  if (!p) return null;
  return `${RAW_ROOT}/${PAPER_BRANCH}/data/short-horizon-gmo-paper/USDJPY/${Number(timeframeMinutes)}m/${p.year}/${p.month}/${p.day}.ndjson`;
}

export function parseNdjson(text, expectedSchema) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const value = JSON.parse(line);
      if (!expectedSchema || value?.schemaVersion === expectedSchema) out.push(value);
    } catch {}
  }
  return out;
}

async function fetchResource(url, { fetchImpl, timeoutMs, mode = 'json', allowMissing = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: mode === 'json' ? 'application/json' : 'text/plain' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      if (allowMissing && response.status === 404) return null;
      throw new Error(`console remote HTTP ${response.status}`);
    }
    return mode === 'json' ? response.json() : response.text();
  } finally {
    clearTimeout(timer);
  }
}

function validateSignalManifest(manifest) {
  if (manifest?.schemaVersion !== SIGNAL_SCHEMA) throw new Error('signal-manifest-schema-mismatch');
  if (manifest?.methodology?.prospectiveOnly !== true || manifest?.methodology?.humanCanonFrozenBenchmark !== true) throw new Error('signal-manifest-methodology-invalid');
  if (manifest?.methodology?.historicalReplayMixedIntoProspective !== false || manifest?.methodology?.profitabilityClaim !== false) throw new Error('signal-manifest-governance-invalid');
  if (Number(manifest?.archive?.duplicateSignalIdCount || 0) !== 0) throw new Error('signal-manifest-duplicates');
}

function validateQuoteManifest(manifest) {
  if (manifest?.schemaVersion !== QUOTE_SCHEMA) throw new Error('quote-manifest-schema-mismatch');
  const g = manifest?.guardrails || {};
  if (g.authenticationRequired !== false || g.accountSpecificPricing !== false || g.fillObserved !== false || g.executionAuthorized !== false || g.realMoneyRouting !== false || g.orderSubmission !== false) throw new Error('quote-manifest-guardrails-invalid');
  if (Number(manifest?.archive?.duplicateQuoteIdCount || 0) !== 0) throw new Error('quote-manifest-duplicates');
}

function validatePaperManifest(manifest) {
  if (manifest?.schemaVersion !== PAPER_SCHEMA) throw new Error('paper-manifest-schema-mismatch');
  const m = manifest?.methodology || {};
  const g = manifest?.guardrails || {};
  if (m.prospectiveSignalsOnly !== true || m.sideCorrectBidAsk !== true || m.quotedSpreadEmbedded !== true) throw new Error('paper-manifest-methodology-invalid');
  if (m.actualFillObserved !== false || m.feesModeled !== false || m.slippageModeled !== false || m.financingOrSwapModeled !== false || m.actualNetEvAvailable !== false || m.optimizer !== false || m.changesHumanCanonThresholds !== false || m.profitabilityClaim !== false) throw new Error('paper-manifest-scientific-guardrail-invalid');
  if (g.usedByDecisionEngine !== false || g.automaticPromotion !== false || g.executionAuthorized !== false || g.realMoneyRouting !== false || g.orderSubmission !== false) throw new Error('paper-manifest-execution-guardrail-invalid');
  if (Number(manifest?.archive?.duplicatePaperIdCount || 0) !== 0) throw new Error('paper-manifest-duplicates');
}

function findUsdJpyStream(manifest, timeframeMinutes) {
  return (manifest?.archive?.streams || []).find(stream => stream?.instrument === 'USDJPY' && Number(stream?.timeframeMinutes) === Number(timeframeMinutes)) || null;
}

function findCurrentUsdJpyRun(manifest, timeframeMinutes) {
  return (manifest?.lastRun?.streams || []).find(stream => stream?.id === `USDJPY-${Number(timeframeMinutes)}m`) || null;
}

export function deriveCurrentUsdJpyCollectionState(signalManifest) {
  const one = findCurrentUsdJpyRun(signalManifest, 1);
  const five = findCurrentUsdJpyRun(signalManifest, 5);
  const runs = [one, five].filter(Boolean);
  const current = runs.length === 2 && runs.every(run => run.status === 'RECORDED' && run?.freshness?.fresh === true);
  return {
    current,
    state: current ? 'CURRENT' : 'NO_CURRENT_FX_SIGNAL',
    reason: current ? null : [...new Set(runs.map(run => run?.reason || run?.freshness?.reason).filter(Boolean))].join(', ') || 'collector-not-current',
    streams: { '1m': one, '5m': five },
  };
}

async function fetchLatestSignalRecord(manifest, timeframeMinutes, options) {
  const stream = findUsdJpyStream(manifest, timeframeMinutes);
  if (!stream?.lastSourceTimestampMs) return null;
  const url = buildSignalArchiveUrl(timeframeMinutes, stream.lastSourceTimestampMs);
  if (!url) return null;
  const text = await fetchResource(url, { ...options, mode: 'text', allowMissing: true });
  if (text == null) return null;
  const rows = parseNdjson(text, SIGNAL_RECORD_SCHEMA)
    .filter(row => row?.observedProspectively === true && row?.market?.instrument === 'USDJPY' && Number(row?.market?.timeframeMinutes) === Number(timeframeMinutes));
  rows.sort((a, b) => Number(b?.market?.sourceTimestampMs || 0) - Number(a?.market?.sourceTimestampMs || 0));
  return rows[0] || null;
}

async function fetchRecentPaperRecords(signalManifest, options) {
  const latestSourceMs = Math.max(
    Number(findUsdJpyStream(signalManifest, 1)?.lastSourceTimestampMs || 0),
    Number(findUsdJpyStream(signalManifest, 5)?.lastSourceTimestampMs || 0),
  );
  const p = dateParts(latestSourceMs);
  if (!p) return [];
  const days = [p.day, shiftUtcDay(p.day, -1)];
  const requests = [];
  for (const day of days) {
    for (const tf of [1, 5]) {
      const url = buildPaperArchiveUrl(tf, day);
      requests.push(fetchResource(url, { ...options, mode: 'text', allowMissing: true }));
    }
  }
  const texts = await Promise.all(requests);
  const records = texts.flatMap(text => text == null ? [] : parseNdjson(text, PAPER_RECORD_SCHEMA));
  const dedup = new Map();
  for (const record of records) if (record?.paperId) dedup.set(record.paperId, record);
  return [...dedup.values()]
    .sort((a, b) => Number(b?.evaluatedAtMs || 0) - Number(a?.evaluatedAtMs || 0))
    .slice(0, 12);
}

export async function fetchShortHorizonSignalPaperSnapshot({ fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  const options = { fetchImpl, timeoutMs };
  const [signalManifest, quoteManifest, paperManifest] = await Promise.all([
    fetchResource(SHORT_HORIZON_SIGNAL_MANIFEST_URL, { ...options, mode: 'json' }),
    fetchResource(GMO_FX_QUOTE_MANIFEST_URL, { ...options, mode: 'json' }),
    fetchResource(GMO_FX_PAPER_MANIFEST_URL, { ...options, mode: 'json' }),
  ]);
  validateSignalManifest(signalManifest);
  validateQuoteManifest(quoteManifest);
  validatePaperManifest(paperManifest);

  const [latest1m, latest5m, recentPaperRecords] = await Promise.all([
    fetchLatestSignalRecord(signalManifest, 1, options),
    fetchLatestSignalRecord(signalManifest, 5, options),
    fetchRecentPaperRecords(signalManifest, options),
  ]);

  return {
    version: SHORT_HORIZON_SIGNAL_PAPER_CONSOLE_REMOTE_VERSION,
    fetchedAtMs: Date.now(),
    currentFx: deriveCurrentUsdJpyCollectionState(signalManifest),
    latestSignals: { '1m': latest1m, '5m': latest5m },
    signalManifest,
    quoteManifest,
    paperManifest,
    recentPaperRecords,
  };
}
