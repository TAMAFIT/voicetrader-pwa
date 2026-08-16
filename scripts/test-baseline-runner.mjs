import assert from 'node:assert/strict';
import { runBaselineSuite } from '../src/research/baseline-runner.js';

function makeSeries(length = 260) {
  let price = 42000;
  const out = [];
  const start = 1_700_000_000;
  for (let i = 0; i < length; i++) {
    const regime = i < 95 ? 0.0045 : i < 165 ? -0.0052 : 0.0038;
    const wave = Math.sin(i / 4.5) * 0.0018;
    const ret = regime + wave;
    const open = price;
    const close = price * (1 + ret);
    const high = Math.max(open, close) * 1.0025;
    const low = Math.min(open, close) * 0.9975;
    out.push({ t: start + i * 14400, o: open, h: high, l: low, c: close, volume: 100 + i });
    price = close;
  }
  return out;
}

const series = makeSeries();
const options = {
  series,
  endIndex: series.length - 1,
  estimatedRoundTripCostBps: 12.5,
  dataSignature: 'baseline-test-series',
};
const first = runBaselineSuite(options);
const second = runBaselineSuite(options);

assert.equal(first.status, 'complete');
assert.equal(first.version, 'baseline-runner-0.1');
assert.equal(first.results.length, 5);
assert.deepEqual(first, second, 'baseline suite must be deterministic for the same series/signature');

const byId = Object.fromEntries(first.results.map(result => [result.id, result]));
for (const id of ['champion', 'buy_hold', 'simple_trend', 'simple_mean_reversion', 'matched_random']) {
  assert.ok(byId[id], `missing baseline ${id}`);
  assert.ok(Number.isFinite(byId[id].returnPct));
  assert.ok(Number.isFinite(byId[id].maxDrawdownPct));
  assert.ok(byId[id].exposurePct >= 0 && byId[id].exposurePct <= 100);
}

assert.ok(byId.champion.trades > 0, 'test series should generate Champion entries');
assert.equal(byId.matched_random.trades, byId.champion.trades, 'Matched Random must match Champion trade count');
assert.equal(byId.matched_random.longTrades, byId.champion.longTrades, 'Matched Random must match Champion long count');
assert.equal(byId.matched_random.shortTrades, byId.champion.shortTrades, 'Matched Random must match Champion short count');
assert.equal(first.methodology.edgeProof, false);
assert.equal(first.methodology.optimizer, false);
assert.equal(first.methodology.parameterSweep, false);
assert.equal(first.methodology.championMutation, false);
assert.equal(first.methodology.commonSignalExitHorizonBars, 3);

console.log('Baseline runner regression tests passed.');
