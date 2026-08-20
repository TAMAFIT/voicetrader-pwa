import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildClosedOhlcMarketEvent } from '../src/short-horizon/market-event.js';
import { assessShortHorizonFreshness } from '../src/short-horizon/freshness-gate.js';
import { classifyAnalyticalSessions } from '../src/short-horizon/session-context.js';
import { buildProspectiveShortHorizonSignal } from '../src/short-horizon/prospective-signal-runner.js';
import {
  inspectSignalArchive,
  mergeSignalsIntoArchive,
  writeSignalArchiveManifest,
} from './lib/short-horizon-signal-archive.mjs';

function makeSeries({
  count = 180,
  timeframeMinutes = 1,
  direction = 1,
  assetClass = 'crypto',
  instrument = 'BTCUSD',
  venue = 'kraken',
  sourceId = 'prospective-signal-test',
  endSourceTimestampMs = Date.UTC(2026, 7, 20, 12, 0, 0),
} = {}) {
  const intervalMs = timeframeMinutes * 60_000;
  const start = endSourceTimestampMs - (count - 1) * intervalMs;
  return Array.from({ length:count }, (_, index) => {
    const close = 100 + direction * index * 0.05;
    const open = close - direction * 0.01;
    return buildClosedOhlcMarketEvent({
      assetClass,
      instrument,
      venue,
      timeframeMinutes,
      sourceTimestampMs:start + index * intervalMs,
      receivedTimestampMs:start + index * intervalMs + intervalMs + 1000,
      open,
      high:Math.max(open, close) + 0.02,
      low:Math.min(open, close) - 0.02,
      close,
      volume:100 + index,
      trades:20 + index,
      sourceId,
    });
  });
}

const events = makeSeries();
const latest = events.at(-1);
const closeAt = latest.sourceTimestampMs + 60_000;

const fresh = assessShortHorizonFreshness(events, { nowMs:closeAt + 2 * 60_000, minimumHistoryBars:160 });
assert.equal(fresh.status, 'FRESH');
assert.equal(fresh.fresh, true);

const stale = assessShortHorizonFreshness(events, { nowMs:closeAt + 10 * 60_000, minimumHistoryBars:160 });
assert.equal(stale.status, 'STALE');
assert.equal(stale.fresh, false);

const insufficient = assessShortHorizonFreshness(events.slice(-100), { nowMs:closeAt + 60_000, minimumHistoryBars:160 });
assert.equal(insufficient.status, 'INSUFFICIENT_HISTORY');

const julyOverlap = classifyAnalyticalSessions(Date.UTC(2026, 6, 1, 12, 0, 0));
assert.equal(julyOverlap.clocks.LONDON.hour, 13);
assert.equal(julyOverlap.clocks.NEW_YORK.hour, 8);
assert.equal(julyOverlap.primarySession, 'LONDON_NEW_YORK_OVERLAP');
assert.equal(julyOverlap.dstHandledByIanaTimeZones, true);
assert.equal(julyOverlap.centralizedExchangeOpenClaim, false);

const winter = classifyAnalyticalSessions(Date.UTC(2026, 0, 15, 12, 0, 0));
assert.equal(winter.clocks.LONDON.hour, 12);
assert.equal(winter.clocks.NEW_YORK.hour, 7);

const result = buildProspectiveShortHorizonSignal(events, {
  nowMs:closeAt + 2 * 60_000,
  inputWindowSha256:'fixed-window-test-sha',
});
assert.equal(result.status, 'RECORDED');
assert.ok(['LONG','SHORT','WAIT'].includes(result.record.decision.signal));
assert.equal(result.record.observedProspectively, true);
assert.equal(result.record.futureOutcomeUsed, false);
assert.equal(result.record.provenance.fixedAnalysisWindowBars, 160);
assert.equal(result.record.provenance.inputWindowSha256, 'fixed-window-test-sha');
assert.equal(result.record.governance.executionAuthorized, false);
assert.equal(result.record.governance.realMoneyRouting, false);
assert.equal(result.record.governance.orderSubmission, false);
assert.equal(result.record.timeContext.sourceTimestampMs, latest.sourceTimestampMs);
assert.equal(Object.hasOwn(result.record.observationContext.freshness, 'observedAtMs'), false);
assert.equal(Object.hasOwn(result.record.observationContext.freshness, 'lagMs'), false);

const staleResult = buildProspectiveShortHorizonSignal(events, {
  nowMs:closeAt + 10 * 60_000,
  inputWindowSha256:'fixed-window-test-sha',
});
assert.equal(staleResult.status, 'SKIPPED');
assert.equal(staleResult.record, null);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'voicetrader-signal-archive-'));
try {
  const first = mergeSignalsIntoArchive({ rootDir:root, records:[result.record], updatedAtMs:closeAt + 120_000 });
  assert.equal(first.added, 1);
  assert.equal(first.duplicates, 0);
  assert.equal(first.filesTouched, 1);

  const retry = JSON.parse(JSON.stringify(result.record));
  retry.generatedAtMs += 10_000;
  retry.market.sourceReceivedTimestampMs += 10_000;
  const duplicate = mergeSignalsIntoArchive({ rootDir:root, records:[retry], updatedAtMs:closeAt + 130_000 });
  assert.equal(duplicate.added, 0);
  assert.equal(duplicate.duplicates, 1);

  const conflict = JSON.parse(JSON.stringify(result.record));
  conflict.decision.signal = conflict.decision.signal === 'LONG' ? 'SHORT' : 'LONG';
  assert.throws(() => mergeSignalsIntoArchive({ rootDir:root, records:[conflict] }), /immutability-conflict/);

  const inspected = inspectSignalArchive(root);
  assert.equal(inspected.recordCount, 1);
  assert.equal(inspected.duplicateSignalIdCount, 0);
  assert.equal(inspected.streams.length, 1);
  assert.equal(inspected.streams[0].recordCount, 1);

  const manifest = writeSignalArchiveManifest({
    rootDir:root,
    lastRun:{
      status:'success',
      aggregate:{ streams:1, recorded:1, skipped:0, failed:0 },
    },
  });
  assert.equal(manifest.storage.branch, 'short-horizon-signal-data');
  assert.equal(manifest.methodology.prospectiveOnly, true);
  assert.equal(manifest.guardrails.executionAuthorized, false);
  assert.equal(manifest.archive.recordCount, 1);
} finally {
  fs.rmSync(root, { recursive:true, force:true });
}

console.log('short-horizon prospective signal runtime tests passed');
