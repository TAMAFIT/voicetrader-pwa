import assert from 'node:assert/strict';
import { buildFixedHorizonCounterfactual } from '../src/research/counterfactual-shadow.js';

const series = Array.from({ length: 10 }, (_, i) => {
  const c = 100 + i * 2;
  return {
    t: 1700000000 + i * 14400,
    o: c - 1,
    h: c + 1,
    l: c - 2,
    c,
  };
});

const result = buildFixedHorizonCounterfactual({
  series,
  entryIndex: 2,
  estimatedRoundTripCostBps: 10,
});

assert.equal(result.status, 'complete');
assert.equal(result.independentSamples, false);
assert.equal(result.usedByDecisionEngine, false);
assert.deepEqual(result.completedHorizons, [1, 3, 6]);
assert.equal(result.outcomes.length, 3);

const h1 = result.outcomes[0];
assert.equal(h1.horizonBars, 1);
assert.equal(h1.entryPrice, 104);
assert.equal(h1.exitPrice, 106);
assert.equal(h1.long.grossReturnBps, 192.31);
assert.equal(h1.long.netReturnBps, 182.31);
assert.equal(h1.short.grossReturnBps, -192.31);
assert.equal(h1.short.netReturnBps, -202.31);
assert.equal(h1.noEntry.netReturnBps, 0);
assert.ok(h1.longMfeBps > 0);
assert.ok(h1.shortMaeBps < 0);

const nearEnd = buildFixedHorizonCounterfactual({
  series,
  entryIndex: 7,
  estimatedRoundTripCostBps: 10,
});
assert.equal(nearEnd.status, 'partial');
assert.deepEqual(nearEnd.completedHorizons, [1]);

const unavailable = buildFixedHorizonCounterfactual({ series: [], entryIndex: 0 });
assert.equal(unavailable.status, 'unavailable');
assert.equal(unavailable.independentSamples, false);

console.log('Fixed-horizon counterfactual labels preserve one-event clustering and deterministic costs.');
