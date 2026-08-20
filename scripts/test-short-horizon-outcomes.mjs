import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildClosedOhlcMarketEvent } from '../src/short-horizon/market-event.js';
import { evaluateShortHorizonOutcome } from '../src/short-horizon/outcome-contract.js';
import { readProspectiveSignalArchive } from './lib/short-horizon-signal-reader.mjs';
import {
  inspectOutcomeArchive,
  mergeOutcomesIntoArchive,
  writeOutcomeArchiveManifest,
} from './lib/short-horizon-outcome-archive.mjs';

const BASE = Date.UTC(2026, 7, 20, 12, 0, 0);

function makeSignal(signal = 'LONG') {
  const sourceTimestampMs = BASE;
  const decisionBarCloseTimestampMs = sourceTimestampMs + 60_000;
  return {
    schemaVersion:'short-horizon-signal-v1',
    signalId:`short-horizon-signal-v1|short-horizon-human-canon-engine-v1|kraken|BTCUSD|1m|${sourceTimestampMs}|${signal}`,
    observationMode:'prospective',
    observedProspectively:true,
    futureOutcomeUsed:false,
    generatedAtMs:decisionBarCloseTimestampMs + 1000,
    decisionBarCloseTimestampMs,
    market:{
      assetClass:'crypto', instrument:'BTCUSD', venue:'kraken', timeframeMinutes:1,
      sourceTimestampMs, sourceReceivedTimestampMs:decisionBarCloseTimestampMs + 500,
      close:100, sourceId:'synthetic-signal-source', sourceEventId:`synthetic-${signal}`,
    },
    decision:{
      signal,
      intendedHorizonMinutes:5,
      secondaryHorizonMinutes:15,
      signalStrengthScore:60,
      confidenceIsCalibratedProbability:false,
      scoreIsExpectedReturn:false,
      aggregation:{ compositeScore:50 },
      context:{ regime:'TREND', riskGate:'OPEN' },
      families:[], reasons:{ support:[], opposition:[] }, features:{ price:100 },
    },
    provenance:{ engineVersion:'short-horizon-human-canon-engine-v1', registryVersion:'short-horizon-human-canon-registry-v1' },
    governance:{
      immutableDecisionTimeRecord:true, outcomeStoredSeparately:true, historicalReplayIsNotProspective:false,
      executionAuthorized:false, realMoneyRouting:false, orderSubmission:false, automaticPromotion:false,
    },
    timeContext:{ sessions:{ primarySession:'LONDON_NEW_YORK_OVERLAP' } },
  };
}

function makeFutureBars({ closes, lows = [], highs = [] } = {}) {
  return closes.map((close, index) => {
    const open = index === 0 ? 100 : closes[index - 1];
    const high = highs[index] ?? Math.max(open, close) + 0.25;
    const low = lows[index] ?? Math.min(open, close) - 0.25;
    return buildClosedOhlcMarketEvent({
      assetClass:'crypto', instrument:'BTCUSD', venue:'kraken', timeframeMinutes:1,
      sourceTimestampMs:BASE + 60_000 + index * 60_000,
      receivedTimestampMs:BASE + 120_000 + index * 60_000,
      open, high, low, close, volume:100 + index, trades:20 + index,
      sourceId:'synthetic-future-source',
    });
  });
}

const rising = makeFutureBars({
  closes:[101,102,103,104,105],
  highs:[102,103,104,105,106],
  lows:[98,100,101,102,103],
});
const target5m = BASE + 60_000 + 5 * 60_000;

const pending = evaluateShortHorizonOutcome({
  signalRecord:makeSignal('LONG'), events:rising, horizonKind:'primary', observedAtMs:target5m - 1,
});
assert.equal(pending.status, 'PENDING_TIME');
assert.equal(pending.record, null);

const missing = evaluateShortHorizonOutcome({
  signalRecord:makeSignal('LONG'), events:rising.slice(0, 4), horizonKind:'primary', observedAtMs:target5m + 1000,
});
assert.equal(missing.status, 'MISSING_DATA');
assert.equal(missing.record, null);
assert.equal(missing.missingSourceTimestampsMs.length, 1);

const longResult = evaluateShortHorizonOutcome({
  signalRecord:makeSignal('LONG'), events:rising, horizonKind:'primary', observedAtMs:target5m + 1000,
  signalRecordSha256:'signal-sha', futureWindowSha256:'future-sha',
});
assert.equal(longResult.status, 'MATURED');
assert.equal(longResult.record.result.rawOutcomeClass, 'WIN');
assert.equal(longResult.record.result.rawDirectionalReturnPct, 5);
assert.equal(longResult.record.result.mfePct, 6);
assert.equal(longResult.record.result.maePct, -2);
assert.equal(longResult.record.result.transactionCostsModeled, false);
assert.equal(longResult.record.result.netReturnPct, null);
assert.equal(longResult.record.provenance.signalRecordSha256, 'signal-sha');
assert.equal(longResult.record.provenance.futureWindowSha256, 'future-sha');

const falling = makeFutureBars({
  closes:[99,98,97,96,95],
  highs:[102,100,99,98,97],
  lows:[98,97,96,95,94],
});
const shortResult = evaluateShortHorizonOutcome({
  signalRecord:makeSignal('SHORT'), events:falling, horizonKind:'primary', observedAtMs:target5m + 1000,
});
assert.equal(shortResult.record.result.rawOutcomeClass, 'WIN');
assert.equal(shortResult.record.result.rawDirectionalReturnPct, 5);
assert.equal(shortResult.record.result.mfePct, 6);
assert.equal(shortResult.record.result.maePct, -2);

const waitResult = evaluateShortHorizonOutcome({
  signalRecord:makeSignal('WAIT'), events:rising, horizonKind:'primary', observedAtMs:target5m + 1000,
});
assert.equal(waitResult.record.result.rawOutcomeClass, 'WAIT_OBSERVATION');
assert.equal(waitResult.record.result.rawDirectionalReturnPct, null);
assert.equal(waitResult.record.result.mfePct, null);
assert.equal(waitResult.record.result.maePct, null);
assert.equal(waitResult.record.market.marketReturnPct, 5);

const secondaryBars = makeFutureBars({ closes:Array.from({ length:15 }, (_, index) => 100 + index + 1) });
const target15m = BASE + 60_000 + 15 * 60_000;
const secondary = evaluateShortHorizonOutcome({
  signalRecord:makeSignal('LONG'), events:secondaryBars, horizonKind:'secondary', observedAtMs:target15m + 1000,
});
assert.equal(secondary.status, 'MATURED');
assert.equal(secondary.record.horizonMinutes, 15);
assert.equal(secondary.record.market.pathBarCount, 15);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'voicetrader-outcome-'));
const signalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'voicetrader-signal-reader-'));
try {
  const first = mergeOutcomesIntoArchive({ rootDir:root, records:[longResult.record] });
  assert.equal(first.added, 1);
  assert.equal(first.duplicates, 0);
  assert.equal(first.filesTouched, 1);

  const retry = JSON.parse(JSON.stringify(longResult.record));
  retry.maturedAtMs += 5000;
  const duplicate = mergeOutcomesIntoArchive({ rootDir:root, records:[retry] });
  assert.equal(duplicate.added, 0);
  assert.equal(duplicate.duplicates, 1);

  const conflict = JSON.parse(JSON.stringify(longResult.record));
  conflict.result.rawDirectionalReturnPct = 999;
  assert.throws(() => mergeOutcomesIntoArchive({ rootDir:root, records:[conflict] }), /immutability-conflict/);

  const inspected = inspectOutcomeArchive(root);
  assert.equal(inspected.recordCount, 1);
  assert.equal(inspected.duplicateOutcomeIdCount, 0);
  assert.equal(inspected.streams[0].directionalOutcomeCounts.WIN, 1);
  assert.equal(inspected.streams[0].descriptiveMetrics.transactionCostsModeled, false);
  assert.equal(inspected.streams[0].descriptiveMetrics.netReturnAvailable, false);

  const manifest = writeOutcomeArchiveManifest({
    rootDir:root,
    lastRun:{ status:'success', aggregate:{ matured:1, pendingTime:0, missingData:0 } },
  });
  assert.equal(manifest.storage.branch, 'short-horizon-outcome-data');
  assert.equal(manifest.storage.sourceSignalsBranch, 'short-horizon-signal-data');
  assert.equal(manifest.methodology.outcomesSeparateFromSignals, true);
  assert.equal(manifest.methodology.transactionCostsModeled, false);
  assert.equal(manifest.methodology.netReturnAvailable, false);
  assert.equal(manifest.guardrails.executionAuthorized, false);
  assert.equal(manifest.guardrails.realMoneyRouting, false);
  assert.equal(manifest.guardrails.orderSubmission, false);

  const signal = makeSignal('WAIT');
  const signalPath = path.join(signalRoot, 'data', 'short-horizon-signals', 'crypto', 'BTCUSD', '1m', '2026', '08');
  fs.mkdirSync(signalPath, { recursive:true });
  fs.writeFileSync(path.join(signalPath, '2026-08-20.ndjson'), `${JSON.stringify(signal)}\n`, 'utf8');
  const read = readProspectiveSignalArchive(signalRoot);
  assert.equal(read.records.length, 1);
  assert.equal(read.records[0].signalId, signal.signalId);
} finally {
  fs.rmSync(root, { recursive:true, force:true });
  fs.rmSync(signalRoot, { recursive:true, force:true });
}

console.log('short-horizon outcome maturation tests passed');
