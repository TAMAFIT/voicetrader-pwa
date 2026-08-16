import assert from 'node:assert/strict';
import {
  buildReturnShuffleSeries,
  buildBlockShuffleSeries,
  runNullMarketControls,
  NULL_CONTROL_VERSION,
} from '../src/research/null-market-runner.js';

function makeSeries(length = 340) {
  const out = [];
  let price = 100;
  for (let i = 0; i < length; i++) {
    const regime = i < 110 ? 0.0042 : i < 220 ? -0.0036 : 0.0028;
    const cycle = Math.sin(i / 5) * 0.0035;
    const shock = i % 37 === 0 ? 0.012 : i % 53 === 0 ? -0.010 : 0;
    const open = price;
    const close = Math.max(1, price * (1 + regime + cycle + shock));
    const range = 0.004 + Math.abs(Math.cos(i / 7)) * 0.004;
    out.push({
      t: 1_700_000_000 + i * 14_400,
      o: open,
      h: Math.max(open, close) * (1 + range),
      l: Math.min(open, close) * (1 - range),
      c: close,
      volume: 100 + i,
      trades: 20 + (i % 17),
    });
    price = close;
  }
  return out;
}

const source = makeSeries();
const sourceSnapshot = JSON.stringify(source);

const shuffledA = buildReturnShuffleSeries(source, 'test-return-seed');
const shuffledB = buildReturnShuffleSeries(source, 'test-return-seed');
assert.deepEqual(shuffledA, shuffledB, 'Return Shuffle must be deterministic for the same seed');
assert.equal(shuffledA.length, source.length);
assert.deepEqual(shuffledA.map(bar => bar.t), source.map(bar => bar.t), 'Return Shuffle must preserve the observation timeline');
assert.notDeepEqual(shuffledA.map(bar => bar.c), source.map(bar => bar.c), 'Return Shuffle must change temporal return order');

const blockedA = buildBlockShuffleSeries(source, 'test-block-seed', 6);
const blockedB = buildBlockShuffleSeries(source, 'test-block-seed', 6);
assert.deepEqual(blockedA, blockedB, 'Block Shuffle must be deterministic for the same seed');
assert.equal(blockedA.length, source.length);
assert.deepEqual(blockedA.map(bar => bar.t), source.map(bar => bar.t), 'Block Shuffle must preserve the observation timeline');

const first = runNullMarketControls({
  series: source,
  endIndex: source.length - 1,
  estimatedRoundTripCostBps: 10,
  dataSignature: 'null-test-series',
  replicates: 8,
});
const second = runNullMarketControls({
  series: source,
  endIndex: source.length - 1,
  estimatedRoundTripCostBps: 10,
  dataSignature: 'null-test-series',
  replicates: 8,
});

assert.equal(first.version, NULL_CONTROL_VERSION);
assert.equal(first.status, 'complete');
assert.deepEqual(first, second, 'Negative Control suite must be fully deterministic');
assert.equal(first.methods.length, 3);
assert.deepEqual(first.methods.map(method => method.id), ['return_shuffle', 'block_shuffle', 'signal_shift']);
assert.equal(first.methodology.formalPValue, false);
assert.equal(first.methodology.edgeProof, false);
assert.equal(first.methodology.optimizer, false);
assert.equal(first.methodology.parameterSweep, false);
assert.equal(first.methodology.championMutation, false);
assert.equal(first.methodology.usedByDecisionEngine, false);
assert.equal(first.methodology.transformedSeriesInjectedIntoLiveEngine, false);
assert.equal(first.methodology.signalShiftPreservesRealMarketSeries, true);
assert.ok(first.realChampion.trades > 0, 'Fixture should produce Champion trades for a meaningful null comparison');

for (const method of first.methods) {
  assert.equal(method.replicates, 8);
  assert.equal(method.primaryMetric, 'avgNetBps');
  assert.equal(method.distributions.avgNetBps.length, 8);
  assert.ok(['real-above-null95', 'null-overlap'].includes(method.screening));
  assert.ok(Number.isFinite(method.nullAvgNetBps.median));
  assert.ok(Number.isFinite(method.nullAvgNetBps.p95));
}

assert.equal(JSON.stringify(source), sourceSnapshot, 'Null controls must never mutate the real market series');
console.log('Null Market controls are deterministic, bounded, diagnostic-only, and isolated from the live decision engine.');
