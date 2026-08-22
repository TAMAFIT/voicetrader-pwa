import assert from 'node:assert/strict';
import {
  buildPaperArchiveUrl,
  buildSignalArchiveUrl,
  deriveCurrentUsdJpyCollectionState,
  fetchShortHorizonSignalPaperSnapshot,
  GMO_FX_PAPER_MANIFEST_URL,
  GMO_FX_QUOTE_MANIFEST_URL,
  SHORT_HORIZON_SIGNAL_MANIFEST_URL,
} from '../src/short-horizon/signal-paper-console-remote.js';

const source1m = Date.parse('2026-08-21T14:21:00Z');
const source5m = Date.parse('2026-08-21T14:20:00Z');

const signalManifest = {
  schemaVersion:'short-horizon-signal-manifest-v1',
  methodology:{ prospectiveOnly:true, humanCanonFrozenBenchmark:true, historicalReplayMixedIntoProspective:false, profitabilityClaim:false },
  archive:{
    recordCount:100,
    duplicateSignalIdCount:0,
    streams:[
      { id:'USDJPY-1m', instrument:'USDJPY', timeframeMinutes:1, lastSourceTimestampMs:source1m },
      { id:'USDJPY-5m', instrument:'USDJPY', timeframeMinutes:5, lastSourceTimestampMs:source5m },
    ],
  },
  lastRun:{
    streams:[
      { id:'USDJPY-1m', status:'SKIPPED', reason:'latest-closed-bar-too-old', freshness:{ fresh:false, reason:'latest-closed-bar-too-old' } },
      { id:'USDJPY-5m', status:'SKIPPED', reason:'latest-closed-bar-too-old', freshness:{ fresh:false, reason:'latest-closed-bar-too-old' } },
    ],
  },
};

const quoteManifest = {
  schemaVersion:'gmo-fx-quote-manifest-v1',
  archive:{ recordCount:62, duplicateQuoteIdCount:0, openQuoteCount:51 },
  lastRun:{ captured:{ sourceTimestampMs:Date.parse('2026-08-22T02:49:48Z'), marketStatus:'CLOSE', bid:158.932, ask:159.032, spreadBps:6.29002 } },
  guardrails:{ authenticationRequired:false, accountSpecificPricing:false, fillObserved:false, executionAuthorized:false, realMoneyRouting:false, orderSubmission:false },
};

const paperManifest = {
  schemaVersion:'gmo-fx-paper-manifest-v1',
  methodology:{ prospectiveSignalsOnly:true, sideCorrectBidAsk:true, quotedSpreadEmbedded:true, actualFillObserved:false, feesModeled:false, slippageModeled:false, financingOrSwapModeled:false, actualNetEvAvailable:false, optimizer:false, changesHumanCanonThresholds:false, profitabilityClaim:false },
  archive:{ recordCount:101, duplicatePaperIdCount:0, directionalCount:1, waitCount:100, meanQuotedRoundTripReturnBps:-2.579233 },
  lastRun:{ aggregate:{ pendingEntry:78, pendingExit:17 } },
  guardrails:{ usedByDecisionEngine:false, automaticPromotion:false, executionAuthorized:false, realMoneyRouting:false, orderSubmission:false },
};

function signal(tf, sourceMs, decision) {
  return {
    schemaVersion:'short-horizon-signal-v1',
    signalId:`signal-${tf}-${sourceMs}`,
    observedProspectively:true,
    market:{ instrument:'USDJPY', timeframeMinutes:tf, sourceTimestampMs:sourceMs, close:158.94 },
    decision:{ signal:decision, signalStrengthScore:51, context:{ regime:'TREND' } },
    timeContext:{ sessions:{ primarySession:'NEW_YORK' } },
  };
}

const waitPaper = {
  schemaVersion:'gmo-fx-paper-execution-v1', paperId:'paper-wait', evaluatedAtMs:Date.parse('2026-08-21T14:30:00Z'),
  signal:{ decision:'WAIT' }, researchMarket:{ timeframeMinutes:1 }, horizon:{ minutes:5 }, status:'NO_TRADE', result:{ quotedRoundTripReturnBps:null },
};
const directionalPaper = {
  schemaVersion:'gmo-fx-paper-execution-v1', paperId:'paper-directional', evaluatedAtMs:Date.parse('2026-08-21T14:40:00Z'),
  signal:{ decision:'SHORT' }, researchMarket:{ timeframeMinutes:5 }, horizon:{ minutes:15 }, status:'SIMULATED_EXECUTED', result:{ quotedRoundTripReturnBps:-2.579233 },
};

const resources = new Map([
  [SHORT_HORIZON_SIGNAL_MANIFEST_URL, { kind:'json', value:signalManifest }],
  [GMO_FX_QUOTE_MANIFEST_URL, { kind:'json', value:quoteManifest }],
  [GMO_FX_PAPER_MANIFEST_URL, { kind:'json', value:paperManifest }],
  [buildSignalArchiveUrl(1, source1m), { kind:'text', value:`${JSON.stringify(signal(1, source1m - 60000, 'WAIT'))}\n${JSON.stringify(signal(1, source1m, 'SHORT'))}\n` }],
  [buildSignalArchiveUrl(5, source5m), { kind:'text', value:`${JSON.stringify(signal(5, source5m, 'LONG'))}\n` }],
  [buildPaperArchiveUrl(1, '2026-08-21'), { kind:'text', value:`${JSON.stringify(waitPaper)}\n` }],
  [buildPaperArchiveUrl(5, '2026-08-21'), { kind:'text', value:`${JSON.stringify(directionalPaper)}\n` }],
]);

const calls = [];
const fetchImpl = async (url, options = {}) => {
  calls.push({ url, options });
  const resource = resources.get(url);
  if (!resource) return { ok:false, status:404, json:async()=>({}), text:async()=>'' };
  return {
    ok:true,
    status:200,
    json:async()=>structuredClone(resource.value),
    text:async()=>String(resource.value),
  };
};

const state = deriveCurrentUsdJpyCollectionState(signalManifest);
assert.equal(state.current, false);
assert.equal(state.state, 'NO_CURRENT_FX_SIGNAL');
assert.match(state.reason, /latest-closed-bar-too-old/);

const snapshot = await fetchShortHorizonSignalPaperSnapshot({ fetchImpl, timeoutMs:1000 });
assert.equal(snapshot.currentFx.current, false, 'stale weekend collector must not become current');
assert.equal(snapshot.latestSignals['1m'].decision.signal, 'SHORT', 'latest archived signal may be shown as last recorded');
assert.equal(snapshot.latestSignals['5m'].decision.signal, 'LONG');
assert.equal(snapshot.quoteManifest.lastRun.captured.marketStatus, 'CLOSE');
assert.equal(snapshot.paperManifest.archive.directionalCount, 1);
assert.equal(snapshot.recentPaperRecords[0].paperId, 'paper-directional');
assert.equal(snapshot.recentPaperRecords[0].status, 'SIMULATED_EXECUTED');
assert(calls.length >= 7);
assert(calls.every(call => call.options?.method === 'GET'), 'console remote must be read-only GET requests');
assert(calls.every(call => call.options?.cache === 'no-store'), 'live evidence reads must bypass browser cache');

const badPaperManifest = structuredClone(paperManifest);
badPaperManifest.methodology.actualNetEvAvailable = true;
const badResources = new Map(resources);
badResources.set(GMO_FX_PAPER_MANIFEST_URL, { kind:'json', value:badPaperManifest });
const badFetch = async (url) => {
  const resource = badResources.get(url);
  if (!resource) return { ok:false, status:404, json:async()=>({}), text:async()=>'' };
  return { ok:true, status:200, json:async()=>structuredClone(resource.value), text:async()=>String(resource.value) };
};
await assert.rejects(() => fetchShortHorizonSignalPaperSnapshot({ fetchImpl:badFetch, timeoutMs:1000 }), /paper-manifest-scientific-guardrail-invalid/);

console.log('Short-Horizon Signal/Paper Console v0.49 tests passed.');
