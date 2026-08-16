import assert from 'node:assert/strict';
import {
  WALK_FORWARD_EMBARGO_BARS,
  WALK_FORWARD_FOLDS,
  buildWalkForwardWindows,
  runWalkForwardEvaluation,
} from '../src/research/walk-forward-runner.js';

function makeSeries(length = 360) {
  let price = 42000;
  const out = [];
  const start = 1_700_000_000;
  for (let i = 0; i < length; i++) {
    const drift = i < 120 ? 0.0034 : i < 230 ? -0.0038 : 0.0026;
    const wave = Math.sin(i / 5.2) * 0.0022 + Math.sin(i / 13) * 0.0011;
    const ret = drift + wave;
    const open = price;
    const close = price * (1 + ret);
    const high = Math.max(open, close) * 1.003;
    const low = Math.min(open, close) * 0.997;
    out.push({ t: start + i * 14400, o: open, h: high, l: low, c: close, volume: 100 + i });
    price = close;
  }
  return out;
}

const series = makeSeries();
const original = JSON.stringify(series);
const options = {
  series,
  endIndex: series.length - 1,
  estimatedRoundTripCostBps: 12.5,
  dataSignature: 'walk-forward-test-series',
};

const windows = buildWalkForwardWindows({ endIndex: series.length - 1 });
assert.equal(windows.length, WALK_FORWARD_FOLDS);
for (let i = 0; i < windows.length; i++) {
  const fold = windows[i];
  assert.equal(fold.embargoBars, WALK_FORWARD_EMBARGO_BARS);
  assert.equal(fold.testStart, fold.embargoEnd + 1);
  assert.equal(fold.embargoStart, fold.contextEnd + 1);
  assert.ok(fold.testEnd >= fold.testStart);
  if (i > 0) assert.ok(fold.embargoStart > windows[i - 1].testEnd, 'folds must advance chronologically');
}

const first = runWalkForwardEvaluation(options);
const second = runWalkForwardEvaluation(options);
assert.equal(first.status, 'complete');
assert.equal(first.version, 'walk-forward-0.1');
assert.deepEqual(first, second, 'walk-forward evaluation must be deterministic');
assert.equal(JSON.stringify(series), original, 'walk-forward evaluation must not mutate source series');
assert.equal(first.folds.length, 3);
assert.equal(first.results.length, 4, 'frozen Champion + exactly 3 Challengers expected');
assert.equal(first.results[0].id, 'champion-001');
assert.equal(first.methodology.chronologicalOrderPreserved, true);
assert.equal(first.methodology.noFittingPerformed, true);
assert.equal(first.methodology.parameterSweep, false);
assert.equal(first.methodology.selfLearning, false);
assert.equal(first.methodology.automaticPromotion, false);
assert.equal(first.methodology.promotionEligible, false);
assert.equal(first.methodology.pristineUntouchedOOS, false);
assert.equal(first.methodology.usedByLiveDecisionEngine, false);
assert.ok(first.methodology.forwardDemoRequiredBeforeFuturePromotion);

for (const fold of first.folds) {
  assert.equal(fold.embargoBars, 3);
  assert.equal(fold.testStart - fold.embargoEnd, 1);
  assert.equal(fold.embargoStart - fold.contextEnd, 1);
  for (const strategy of fold.results) {
    assert.equal(strategy.liveDecisionEngine, strategy.role === 'champion');
  }
}

for (const strategy of first.results) {
  assert.ok(strategy.positiveFolds >= 0 && strategy.positiveFolds <= 3);
  assert.ok(strategy.trades >= 0);
  assert.ok(Number.isFinite(strategy.returnPct));
  assert.ok(Number.isFinite(strategy.avgNetBps));
  for (const trade of strategy.tradesDetail) {
    const fold = first.folds.find(item => trade.entryIndex >= item.testStart && trade.entryIndex <= item.testEnd);
    assert.ok(fold, 'every aggregate trade must belong to a test fold');
    assert.ok(trade.exitIndex <= fold.testEnd, 'fixed-horizon exit must not cross test fold boundary');
    assert.ok(trade.entryIndex > fold.embargoEnd, 'no trade may enter inside the embargo');
  }
}

const tooShort = runWalkForwardEvaluation({ series: makeSeries(130), endIndex: 129 });
assert.equal(tooShort.status, 'unavailable');
assert.equal(tooShort.results.length, 0);

console.log('Chronological walk-forward regression tests passed.');
