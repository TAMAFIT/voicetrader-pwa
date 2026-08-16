import assert from 'node:assert/strict';
import { FORWARD_EPOCH, getForwardEpochSnapshot } from '../src/research/forward-epoch.js';
import { getPostFreezeBarIndexes, runProspectiveForwardSnapshot, summarizeForwardTrades } from '../src/research/forward-demo-runner.js';
import { mergeForwardEvidence, buildResumeAfterByStrategy, detectObservedBarGaps } from '../src/research/forward-evidence-store.js';

const interval = 4 * 60 * 60;
const start = FORWARD_EPOCH.frozenAtUnix - 100 * interval;
const series = [];
let price = 100;
for (let i = 0; i < 145; i++) {
  const o = price;
  const drift = i % 17 < 12 ? 0.0045 : -0.0015;
  const c = o * (1 + drift);
  series.push({ t: start + i * interval, o, h: Math.max(o, c) * 1.002, l: Math.min(o, c) * 0.998, c, volume: 100 + i });
  price = c;
}

assert.equal(FORWARD_EPOCH.frozenAtIso, '2026-08-16T14:27:00Z');
assert.equal(FORWARD_EPOCH.frozenAtUnix, 1786890420);
assert.equal(FORWARD_EPOCH.governance.automaticPromotion, false);
assert.equal(FORWARD_EPOCH.governance.promotionEligible, false);
assert.equal(FORWARD_EPOCH.strategies.length, 4);
assert.deepEqual(FORWARD_EPOCH.strategies.map(item => item.id), [
  'champion-001',
  'challenger-001-stricter-entry',
  'challenger-002-trend-tilt',
  'challenger-003-momentum-confirm',
]);
assert.ok(Object.isFrozen(FORWARD_EPOCH));
assert.ok(Object.isFrozen(FORWARD_EPOCH.strategies));
assert.deepEqual(getForwardEpochSnapshot().strategies.map(item => item.id), FORWARD_EPOCH.strategies.map(item => item.id));

const indexes = getPostFreezeBarIndexes(series);
assert.ok(indexes.length > 0);
assert.ok(indexes.every(index => series[index].t > FORWARD_EPOCH.frozenAtUnix));
assert.equal(series[indexes[0] - 1].t, FORWARD_EPOCH.frozenAtUnix, 'bar exactly at freeze must stay excluded');

const sourceBefore = JSON.stringify(series);
const fixedObservedAt = 1787000000000;
const runA = runProspectiveForwardSnapshot({
  series,
  dataSignature: 'synthetic-test-signature',
  observedAt: fixedObservedAt,
});
const runB = runProspectiveForwardSnapshot({
  series,
  dataSignature: 'synthetic-test-signature',
  observedAt: fixedObservedAt,
});
assert.equal(runA.status, 'complete');
assert.deepEqual(runA, runB, 'prospective evaluation must be deterministic');
assert.equal(JSON.stringify(series), sourceBefore, 'runner must not mutate source series');
assert.equal(runA.methodology.prospectiveOnly, true);
assert.equal(runA.methodology.preFreezeBarsUsedForIndicatorsOnly, true);
assert.equal(runA.methodology.automaticPromotion, false);
assert.equal(runA.methodology.promotionEligible, false);
assert.ok(runA.postFreezeBarTimes.every(t => t > FORWARD_EPOCH.frozenAtUnix));
for (const trade of runA.trades) {
  assert.ok(trade.entryTime > FORWARD_EPOCH.frozenAtUnix, 'pre-freeze entry leaked into forward evidence');
  assert.ok(trade.exitTime > FORWARD_EPOCH.frozenAtUnix, 'pre-freeze exit leaked into forward evidence');
  assert.equal(trade.prospective, true);
  assert.equal(trade.epochId, FORWARD_EPOCH.id);
  assert.equal(trade.engineVersion, FORWARD_EPOCH.provenance.shadowEngineVersion);
  assert.equal(trade.executionProfile, FORWARD_EPOCH.provenance.executionProfile);
}

const fakeTrade = {
  evidenceKey: `${FORWARD_EPOCH.id}:champion-001:${FORWARD_EPOCH.frozenAtUnix + interval}:${FORWARD_EPOCH.frozenAtUnix + interval * 4}`,
  epochId: FORWARD_EPOCH.id,
  strategyId: 'champion-001',
  strategyLabel: 'Champion',
  role: 'champion',
  entryTime: FORWARD_EPOCH.frozenAtUnix + interval,
  exitTime: FORWARD_EPOCH.frozenAtUnix + interval * 4,
  netReturnBps: 25,
};
const snapshot = {
  dataSignature: 'sig-a',
  postFreezeBarTimes: [FORWARD_EPOCH.frozenAtUnix + interval, FORWARD_EPOCH.frozenAtUnix + interval * 2],
  trades: [fakeTrade, { ...fakeTrade }],
};
const mergedOnce = mergeForwardEvidence(null, snapshot);
assert.equal(mergedOnce.trades.length, 1, 'same evidence key must deduplicate');
const mergedTwice = mergeForwardEvidence(mergedOnce, snapshot);
assert.equal(mergedTwice.trades.length, 1, 'reload must not double-count prospective evidence');
assert.deepEqual(mergedTwice.observedBarTimes, snapshot.postFreezeBarTimes);
assert.equal(mergedTwice.dataSignatures.length, 1);

const resume = buildResumeAfterByStrategy(mergedTwice);
assert.equal(resume['champion-001'], fakeTrade.exitTime);
assert.equal(resume['challenger-001-stricter-entry'], FORWARD_EPOCH.frozenAtUnix);

const gaps = detectObservedBarGaps([
  FORWARD_EPOCH.frozenAtUnix + interval,
  FORWARD_EPOCH.frozenAtUnix + interval * 2,
  FORWARD_EPOCH.frozenAtUnix + interval * 4,
]);
assert.equal(gaps.length, 1);
assert.equal(gaps[0].missingBars, 1);

const summary = summarizeForwardTrades({
  trades: mergedTwice.trades,
  observedBarTimes: mergedTwice.observedBarTimes,
});
assert.equal(summary.methodology.automaticPromotion, false);
assert.equal(summary.methodology.promotionEligible, false);
assert.equal(summary.observedPostFreezeBars, 2);
assert.equal(summary.results.find(item => item.id === 'champion-001').trades, 1);

console.log('Prospective Forward Demo regression tests passed.');
