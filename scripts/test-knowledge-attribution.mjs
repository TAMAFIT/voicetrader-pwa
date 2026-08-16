import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DIRECTIONAL_FAMILIES } from '../src/knowledge/expert-library.js';
import { runKnowledgeShadow } from '../src/research/knowledge-shadow-runner.js';
import { runKnowledgeAttribution, FAMILY_NEGATIVE_CONTROL_LAGS } from '../src/research/knowledge-attribution-runner.js';

const FOUR_HOURS = 4 * 60 * 60;
const series = [];
let price = 28000;
for (let i = 0; i < 340; i++) {
  const regime = i < 100 ? .0023 : i < 210 ? -.0014 : .0017;
  const cycle = Math.sin(i / 6.3) * .0032 + Math.cos(i / 17) * .0011;
  const ret = regime + cycle;
  const o = price;
  const c = Math.max(100, price * (1 + ret));
  const h = Math.max(o, c) * (1 + .0035 + Math.abs(Math.sin(i / 4.7)) * .003);
  const l = Math.min(o, c) * (1 - .0035 - Math.abs(Math.cos(i / 5.4)) * .003);
  const volume = 120 + (i % 19) * 8 + (i % 37 === 0 ? 330 : 0);
  series.push({ t:1700000000 + i * FOUR_HOURS, o, h, l, c, volume });
  price = c;
}

const sourceBefore = JSON.stringify(series);
const options = {
  series,
  endIndex:300,
  estimatedRoundTripCostBps:11.5,
  dataSignature:'attribution-test-series',
};
const a = runKnowledgeAttribution(options);
const b = runKnowledgeAttribution(options);
assert.equal(a.status, 'complete');
assert.deepEqual(a, b, 'Knowledge attribution must be deterministic');
assert.equal(JSON.stringify(series), sourceBefore, 'Knowledge attribution must not mutate source candles');
assert.equal(a.expertAblations.length, 15);
assert.equal(a.familyAblations.length, DIRECTIONAL_FAMILIES.length);
assert.deepEqual(a.familyNegativeControl.lagsBars, [...FAMILY_NEGATIVE_CONTROL_LAGS]);
assert.ok(FAMILY_NEGATIVE_CONTROL_LAGS.every(lag => lag > 0), 'Family controls must use past signals only');
assert.equal(a.methodology.familyNullUsesPastSignalsOnly, true);
assert.equal(a.methodology.familyNullPreservesMarketSeries, true);
assert.equal(a.methodology.causalAttribution, false);
assert.equal(a.methodology.formalPValue, false);
assert.equal(a.methodology.automaticPruning, false);
assert.equal(a.methodology.adaptiveWeights, false);
assert.equal(a.methodology.automaticPromotion, false);
assert.equal(a.methodology.championMutation, false);
assert.equal(a.methodology.usedByLiveDecisionEngine, false);
assert.equal(a.methodology.usedByForwardEvidence, false);

for (const family of a.familyAblations) {
  assert.ok(DIRECTIONAL_FAMILIES.includes(family.family));
  assert.equal(family.negativeControl.replicates.length, FAMILY_NEGATIVE_CONTROL_LAGS.length);
  assert.ok(['aligned-above-null95','null-overlap'].includes(family.negativeControl.screening));
  assert.equal(family.negativeControl.avgNetBpsNull.finiteReplicates, FAMILY_NEGATIVE_CONTROL_LAGS.length);
}
for (const expert of a.expertAblations) {
  assert.ok(['supportive-sensitivity','drag-in-sample','mixed-sensitivity'].includes(expert.diagnostic));
  assert.ok(Number.isFinite(Number(expert.deltaAvgNetBps)));
}

const canonical = runKnowledgeShadow({
  series,
  endIndex:300,
  estimatedRoundTripCostBps:11.5,
  dataSignature:'attribution-test-series',
});
assert.deepEqual(a.referenceSummary, canonical.summary, 'Attribution full reference must equal the canonical Knowledge Shadow');

const alteredBeyondWindow = JSON.parse(JSON.stringify(series));
for (let i = 301; i < alteredBeyondWindow.length; i++) {
  alteredBeyondWindow[i].o *= 4;
  alteredBeyondWindow[i].h *= 8;
  alteredBeyondWindow[i].l *= .15;
  alteredBeyondWindow[i].c *= 5;
  alteredBeyondWindow[i].volume *= 100;
}
const noFutureLeak = runKnowledgeAttribution({ ...options, series:alteredBeyondWindow });
assert.deepEqual(a, noFutureLeak, 'Candles after the declared evaluation end must not affect attribution results');

const championSource = fs.readFileSync(new URL('../src/engine/shadow-engine.js', import.meta.url), 'utf8');
const liveSource = fs.readFileSync(new URL('../src/live/live-forward-paper.js', import.meta.url), 'utf8');
const forwardSource = fs.readFileSync(new URL('../src/research/forward-demo-runner.js', import.meta.url), 'utf8');
for (const source of [championSource, liveSource, forwardSource]) {
  assert.ok(!source.includes('knowledge-attribution'));
  assert.ok(!source.includes('runKnowledgeAttribution'));
}

console.log('Knowledge Attribution / Ablation regression tests passed.');
