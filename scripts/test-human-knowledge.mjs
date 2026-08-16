import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HUMAN_KNOWLEDGE_REGISTRY } from '../src/knowledge/knowledge-registry.js';
import { HumanKnowledgeEngine } from '../src/knowledge/human-knowledge-engine.js';
import { aggregateFamilies, DIRECTIONAL_FAMILIES } from '../src/knowledge/expert-library.js';
import { runKnowledgeShadow } from '../src/research/knowledge-shadow-runner.js';

const FOUR_HOURS = 4 * 60 * 60;
const series = [];
let price = 30000;
for (let i = 0; i < 260; i++) {
  const trend = i < 90 ? .0025 : i < 170 ? -.0012 : .0015;
  const cycle = Math.sin(i / 7) * .003;
  const ret = trend + cycle;
  const o = price;
  const c = Math.max(100, price * (1 + ret));
  const h = Math.max(o, c) * (1 + .004 + Math.abs(Math.sin(i / 5)) * .003);
  const l = Math.min(o, c) * (1 - .004 - Math.abs(Math.cos(i / 6)) * .003);
  series.push({ t:1700000000 + i * FOUR_HOURS, o, h, l, c, volume:100 + (i % 17) * 9 + (i % 31 === 0 ? 280 : 0) });
  price = c;
}

assert.ok(HUMAN_KNOWLEDGE_REGISTRY.items.length >= 20, 'Wave 1 should codify at least 20 knowledge rules/context items');
assert.equal(HUMAN_KNOWLEDGE_REGISTRY.philosophy.adaptiveWeights, false);
assert.equal(HUMAN_KNOWLEDGE_REGISTRY.philosophy.automaticPromotion, false);
assert.ok(HUMAN_KNOWLEDGE_REGISTRY.items.every(item => item.researchOnly && !item.activeInChampion && !item.profitabilityClaim));

const engine = new HumanKnowledgeEngine();
const idx = 210;
const sourceBefore = JSON.stringify(series);
const a = engine.analyze(series, idx);
const b = engine.analyze(series, idx);
assert.equal(a.status, 'complete');
assert.deepEqual(a, b, 'Knowledge Engine must be deterministic');
assert.equal(JSON.stringify(series), sourceBefore, 'Knowledge Engine must not mutate source series');
assert.equal(a.experts.length, 15);
assert.deepEqual(Object.keys(a.families), DIRECTIONAL_FAMILIES);
assert.ok(a.experts.every(item => item.score >= -100 && item.score <= 100));
assert.ok(a.knowledgeScore >= -100 && a.knowledgeScore <= 100);
assert.equal(a.governance.usedByLiveDecisionEngine, false);
assert.equal(a.governance.usedByForwardEvidence, false);
assert.equal(a.governance.championMutation, false);
assert.equal(a.confidenceIsCalibratedProbability, false);
assert.equal(a.scoreIsExpectedReturn, false);

const alteredFuture = JSON.parse(JSON.stringify(series));
for (let i = idx + 1; i < alteredFuture.length; i++) {
  alteredFuture[i].c *= 10;
  alteredFuture[i].h *= 11;
  alteredFuture[i].l *= .1;
  alteredFuture[i].volume *= 100;
}
const noLookahead = engine.analyze(alteredFuture, idx);
assert.deepEqual(a, noLookahead, 'Future candles must not affect current knowledge analysis');

const aggregation = aggregateFamilies([
  { family:'trend', score:100, active:true, id:'t1' },
  { family:'trend', score:-100, active:true, id:'t2' },
  { family:'momentum', score:50, active:true, id:'m1' },
]);
assert.equal(aggregation.families.trend.score, 0);
assert.equal(aggregation.families.momentum.score, 50);
assert.equal(aggregation.compositeScore, 25, 'Active families receive equal aggregate weight regardless of how many rules are inside each family');
assert.equal(aggregation.equalFamilyWeight, true);

const shadowA = runKnowledgeShadow({ series, estimatedRoundTripCostBps:10, dataSignature:'test-series' });
const shadowB = runKnowledgeShadow({ series, estimatedRoundTripCostBps:10, dataSignature:'test-series' });
assert.equal(shadowA.status, 'complete');
assert.deepEqual(shadowA, shadowB, 'Knowledge Shadow must be deterministic');
assert.equal(shadowA.methodology.championMutation, false);
assert.equal(shadowA.methodology.usedByLiveDecisionEngine, false);
assert.equal(shadowA.methodology.usedByForwardEvidence, false);
assert.equal(shadowA.methodology.adaptiveWeights, false);
for (let i = 1; i < shadowA.trades.length; i++) {
  assert.ok(shadowA.trades[i].entryIndex > shadowA.trades[i - 1].exitIndex, 'Research trades must not overlap');
}

const championSource = fs.readFileSync(new URL('../src/engine/shadow-engine.js', import.meta.url), 'utf8');
const liveSource = fs.readFileSync(new URL('../src/live/live-forward-paper.js', import.meta.url), 'utf8');
const forwardSource = fs.readFileSync(new URL('../src/research/forward-demo-runner.js', import.meta.url), 'utf8');
for (const source of [championSource, liveSource, forwardSource]) {
  assert.ok(!source.includes('/knowledge/'));
  assert.ok(!source.includes('HumanKnowledgeEngine'));
}

console.log('Human Trading Knowledge Engine Wave 1 regression tests passed.');
