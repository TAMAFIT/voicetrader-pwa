import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HUMAN_PLAYBOOK_REGISTRY } from '../src/knowledge/playbook-registry.js';
import { HumanPlaybookEngine, PLAYBOOK_ARCHETYPES } from '../src/knowledge/playbook-engine.js';
import { runPlaybookShadow } from '../src/research/playbook-shadow-runner.js';
import { runPlaybookAttribution, PLAYBOOK_NEGATIVE_CONTROL_LAGS } from '../src/research/playbook-attribution-runner.js';
import { runPlaybookWalkForward } from '../src/research/playbook-walk-forward.js';

const FOUR_HOURS = 4 * 60 * 60;
const series = [];
let price = 30000;
for (let i = 0; i < 430; i++) {
  let drift = 0;
  if (i < 110) drift = .0022;
  else if (i < 190) drift = Math.sin(i / 5) * .0007;
  else if (i < 285) drift = -.0017;
  else if (i < 335) drift = Math.sin(i / 3) * .00035;
  else drift = .0014;
  const cycle = Math.sin(i / 9) * .0018;
  const shock = i % 73 === 0 ? .012 : i % 89 === 0 ? -.011 : 0;
  const ret = drift + cycle + shock;
  const o = price;
  const c = Math.max(100, price * (1 + ret));
  const rangeBoost = i >= 285 && i < 335 ? .002 : .005;
  const h = Math.max(o,c) * (1 + rangeBoost + Math.abs(Math.sin(i / 6)) * .003);
  const l = Math.min(o,c) * (1 - rangeBoost - Math.abs(Math.cos(i / 7)) * .003);
  const volume = 120 + (i % 19) * 8 + (i % 47 === 0 ? 420 : 0) + Math.abs(ret) * 12000;
  series.push({ t:1700000000 + i * FOUR_HOURS,o,h,l,c,volume });
  price = c;
}

const alphaItems = HUMAN_PLAYBOOK_REGISTRY.items.filter(item => item.role === 'alpha');
const gateItems = HUMAN_PLAYBOOK_REGISTRY.items.filter(item => item.role === 'gate');
assert.equal(HUMAN_PLAYBOOK_REGISTRY.version,'human-playbook-registry-0.1');
assert.equal(alphaItems.length,12);
assert.equal(gateItems.length,1);
assert.ok(HUMAN_PLAYBOOK_REGISTRY.items.every(item => item.preRegistered && item.researchOnly && !item.activeInChampion && !item.activeInLiveForward && !item.activeInForwardEvidence && !item.profitabilityClaim));
assert.equal(HUMAN_PLAYBOOK_REGISTRY.philosophy.optimizer,false);
assert.equal(HUMAN_PLAYBOOK_REGISTRY.philosophy.automaticPromotion,false);

const engine = new HumanPlaybookEngine();
const idx = 350;
const sourceBefore = JSON.stringify(series);
const a = engine.analyze(series,idx);
const b = engine.analyze(series,idx);
assert.equal(a.status,'complete');
assert.deepEqual(a,b,'Playbook Engine must be deterministic');
assert.equal(JSON.stringify(series),sourceBefore,'Playbook Engine must not mutate source series');
assert.equal(a.playbooks.length,12);
assert.equal(a.gates.length,1);
assert.deepEqual(Object.keys(a.archetypes),PLAYBOOK_ARCHETYPES);
assert.ok(a.playbooks.every(item => item.score >= -100 && item.score <= 100));
assert.ok(a.playbookScore >= -100 && a.playbookScore <= 100);
assert.equal(a.scoreIsExpectedReturn,false);
assert.equal(a.confidenceIsCalibratedProbability,false);
assert.equal(a.governance.championMutation,false);
assert.equal(a.governance.usedByLiveDecisionEngine,false);
assert.equal(a.governance.usedByForwardEvidence,false);
assert.equal(a.governance.automaticPruning,false);

const alteredFuture = JSON.parse(JSON.stringify(series));
for (let i = idx + 1; i < alteredFuture.length; i++) {
  alteredFuture[i].c *= 12;
  alteredFuture[i].h *= 13;
  alteredFuture[i].l *= .08;
  alteredFuture[i].volume *= 200;
}
assert.deepEqual(a,engine.analyze(alteredFuture,idx),'Future candles must not affect current Playbook analysis');

const shadowA = runPlaybookShadow({ series,endIndex:410,estimatedRoundTripCostBps:10,dataSignature:'playbook-test' });
const shadowB = runPlaybookShadow({ series,endIndex:410,estimatedRoundTripCostBps:10,dataSignature:'playbook-test' });
assert.equal(shadowA.status,'complete');
assert.deepEqual(shadowA,shadowB,'Playbook Shadow must be deterministic');
assert.equal(shadowA.methodology.championMutation,false);
assert.equal(shadowA.methodology.usedByLiveDecisionEngine,false);
assert.equal(shadowA.methodology.usedByForwardEvidence,false);
assert.equal(shadowA.methodology.sameSeriesDiagnosticOnly,true);
for (let i = 1; i < shadowA.trades.length; i++) assert.ok(shadowA.trades[i].entryIndex > shadowA.trades[i - 1].exitIndex,'Playbook research trades must not overlap');

const attributionA = runPlaybookAttribution({ series,endIndex:410,estimatedRoundTripCostBps:10,dataSignature:'playbook-test' });
const attributionB = runPlaybookAttribution({ series,endIndex:410,estimatedRoundTripCostBps:10,dataSignature:'playbook-test' });
assert.equal(attributionA.status,'complete');
assert.deepEqual(attributionA,attributionB,'Playbook Attribution must be deterministic');
assert.equal(attributionA.playbookAblations.length,12);
assert.equal(attributionA.archetypeAblations.length,4);
assert.equal(attributionA.gateAblations.length,1);
assert.equal(attributionA.negativeControl.archetypes.length,4);
assert.ok(attributionA.negativeControl.archetypes.every(item => item.replicates.length === PLAYBOOK_NEGATIVE_CONTROL_LAGS.length));
assert.deepEqual(attributionA.referenceSummary,shadowA.summary,'Attribution reference must equal canonical Playbook Shadow');
assert.equal(attributionA.methodology.causalAttribution,false);
assert.equal(attributionA.methodology.formalPValue,false);
assert.equal(attributionA.methodology.automaticPruning,false);

const alteredAfterEnd = JSON.parse(JSON.stringify(series));
for (let i = 411; i < alteredAfterEnd.length; i++) {
  alteredAfterEnd[i].c *= .01;
  alteredAfterEnd[i].h *= 100;
  alteredAfterEnd[i].l *= .001;
  alteredAfterEnd[i].volume *= 1000;
}
const attributionNoFuture = runPlaybookAttribution({ series:alteredAfterEnd,endIndex:410,estimatedRoundTripCostBps:10,dataSignature:'playbook-test' });
assert.deepEqual(attributionA,attributionNoFuture,'Bars after the evaluation end must not alter Playbook Attribution');

const walk = runPlaybookWalkForward({ series,endIndex:410,estimatedRoundTripCostBps:10,dataSignature:'playbook-test' });
assert.equal(walk.status,'complete');
assert.equal(walk.folds,3);
assert.equal(walk.foldResults.length,3);
assert.equal(walk.methodology.noFittingPerformed,true);
assert.equal(walk.methodology.pristineUntouchedOOS,false);
assert.equal(walk.methodology.promotionEligible,false);
assert.equal(walk.methodology.usedByLiveDecisionEngine,false);
assert.ok(walk.foldResults.every(item => item.playbookSummary && item.wave1Summary));

const championSource = fs.readFileSync(new URL('../src/engine/shadow-engine.js',import.meta.url),'utf8');
const liveSource = fs.readFileSync(new URL('../src/live/live-forward-paper.js',import.meta.url),'utf8');
const forwardSource = fs.readFileSync(new URL('../src/research/forward-demo-runner.js',import.meta.url),'utf8');
const wave1Source = fs.readFileSync(new URL('../src/knowledge/human-knowledge-engine.js',import.meta.url),'utf8');
for (const source of [championSource,liveSource,forwardSource,wave1Source]) {
  assert.ok(!source.includes('HumanPlaybookEngine'));
  assert.ok(!source.includes('playbook-engine'));
}

console.log('Human Trading Playbook Engine Wave 2 regression tests passed.');
