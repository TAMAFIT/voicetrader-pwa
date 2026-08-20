import assert from 'node:assert/strict';
import { buildClosedOhlcMarketEvent } from '../src/short-horizon/market-event.js';
import { analyzeShortHorizonHumanCanon } from '../src/short-horizon/human-canon-engine.js';
import { buildShortHorizonSignalRecord, validateShortHorizonSignalRecord } from '../src/short-horizon/signal-contract.js';
import {
  auditShortHorizonSignalLedger,
  emptyShortHorizonSignalLedger,
  mergeProspectiveShortHorizonSignals,
} from '../src/short-horizon/prospective-signal-ledger.js';

const BASE = Date.UTC(2026, 7, 20, 0, 0, 0);
const events = Array.from({ length:160 }, (_, index) => {
  const close = 100 + index * 0.1;
  return buildClosedOhlcMarketEvent({
    assetClass:'crypto', instrument:'BTCUSD', venue:'kraken', timeframeMinutes:1,
    sourceTimestampMs:BASE + index * 60_000,
    receivedTimestampMs:BASE + index * 60_000 + 61_000,
    open:close - 0.03, high:close + 0.05, low:close - 0.05, close,
    volume:100 + index * 2, trades:20 + index, sourceId:'signal-contract-test',
  });
});
const analysis = analyzeShortHorizonHumanCanon(events);
const latest = events.at(-1);
const closeAt = latest.sourceTimestampMs + 60_000;

const replay = buildShortHorizonSignalRecord({
  analysis,
  latestMarketEvent:latest,
  generatedAtMs:closeAt + 1000,
  observationMode:'historical-replay',
});
assert.equal(validateShortHorizonSignalRecord(replay), true);
assert.equal(replay.observedProspectively, false);
assert.equal(replay.governance.historicalReplayIsNotProspective, true);

const prospective = buildShortHorizonSignalRecord({
  analysis,
  latestMarketEvent:latest,
  generatedAtMs:closeAt + 1000,
  observationMode:'prospective',
  dataManifestSha256:'test-manifest-sha',
});
assert.equal(validateShortHorizonSignalRecord(prospective), true);
assert.equal(prospective.observedProspectively, true);
assert.equal(prospective.futureOutcomeUsed, false);
assert.equal(prospective.governance.executionAuthorized, false);
assert.equal(prospective.provenance.dataManifestSha256, 'test-manifest-sha');
assert.throws(() => buildShortHorizonSignalRecord({
  analysis,
  latestMarketEvent:latest,
  generatedAtMs:closeAt - 1,
  observationMode:'prospective',
}), /before-bar-close/);

const empty = emptyShortHorizonSignalLedger();
const first = mergeProspectiveShortHorizonSignals(empty, [prospective], { updatedAtMs:closeAt + 2000 });
assert.equal(first.summary.added, 1);
assert.equal(first.ledger.records.length, 1);
assert.equal(auditShortHorizonSignalLedger(first.ledger).pass, true);

const duplicate = mergeProspectiveShortHorizonSignals(first.ledger, [prospective], { updatedAtMs:closeAt + 3000 });
assert.equal(duplicate.summary.duplicates, 1);
assert.equal(duplicate.ledger.records.length, 1);

const conflict = JSON.parse(JSON.stringify(prospective));
conflict.decision.signal = prospective.decision.signal === 'LONG' ? 'WAIT' : 'LONG';
assert.throws(() => mergeProspectiveShortHorizonSignals(first.ledger, [conflict]), /immutability-conflict/);
assert.throws(() => mergeProspectiveShortHorizonSignals(empty, [replay]), /rejects-nonprospective/);

console.log('short-horizon signal contract and ledger tests passed');
