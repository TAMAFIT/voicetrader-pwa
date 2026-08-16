import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  KNOWLEDGE_FORWARD_EPOCH,
  KNOWLEDGE_FORWARD_EPOCH_ID,
  KNOWLEDGE_FORWARD_FREEZE_UNIX,
  KNOWLEDGE_FORWARD_CANDIDATE_IDS,
  assertKnowledgeForwardEpochRuntime,
} from '../src/research/knowledge-forward-epoch.js';
import {
  getKnowledgeForwardEligibleIndexes,
  isKnowledgeForwardEligibleBar,
  runKnowledgeForwardSnapshot,
  detectKnowledgeForwardBarGaps,
} from '../src/research/knowledge-forward-runner.js';
import {
  emptyKnowledgeForwardArchive,
  mergeKnowledgeForwardArchive,
  summarizeKnowledgeForwardArchive,
} from '../src/research/knowledge-forward-store.js';
import { estimateResearchRoundTripCostBps, RESEARCH_COST_MODEL_VERSION } from '../src/research/research-cost-model.js';

const FOUR_HOURS = 4 * 60 * 60;
const series = [];
let price = 31000;
const startTime = KNOWLEDGE_FORWARD_FREEZE_UNIX - 220 * FOUR_HOURS;
for (let i = 0; i < 285; i++) {
  const phase = i < 90 ? .0018 : i < 160 ? -.00125 : i < 225 ? .00145 : .0021;
  const cycle = Math.sin(i / 8) * .0015;
  const shock = i % 61 === 0 ? .009 : i % 79 === 0 ? -.008 : 0;
  const ret = phase + cycle + shock;
  const o = price;
  const c = Math.max(100, price * (1 + ret));
  const h = Math.max(o, c) * (1 + .004 + Math.abs(Math.sin(i / 7)) * .002);
  const l = Math.min(o, c) * (1 - .004 - Math.abs(Math.cos(i / 6)) * .002);
  const volume = 130 + (i % 17) * 11 + (i % 43 === 0 ? 390 : 0) + Math.abs(ret) * 12000;
  series.push({ t:startTime + i * FOUR_HOURS, o, h, l, c, volume });
  price = c;
}

assert.equal(KNOWLEDGE_FORWARD_EPOCH_ID, 'knowledge-forward-001');
assert.equal(KNOWLEDGE_FORWARD_FREEZE_UNIX, 1786921094);
assert.equal(KNOWLEDGE_FORWARD_EPOCH.frozenAtIso, '2026-08-16T22:58:14Z');
assert.equal(KNOWLEDGE_FORWARD_EPOCH.horizonBars, 3);
assert.equal(KNOWLEDGE_FORWARD_EPOCH.researchCostModelVersion, RESEARCH_COST_MODEL_VERSION);
assert.deepEqual([...KNOWLEDGE_FORWARD_CANDIDATE_IDS], [
  'candidate-wave1-reference',
  'candidate-playbook-reference',
  'candidate-consensus',
  'candidate-playbook-wave1-veto',
]);
assert.equal(KNOWLEDGE_FORWARD_EPOCH.governance.fixedCandidateCount, 4);
assert.equal(KNOWLEDGE_FORWARD_EPOCH.governance.automaticPromotion, false);
assert.equal(assertKnowledgeForwardEpochRuntime(), true);
assert.equal(isKnowledgeForwardEligibleBar({ t:KNOWLEDGE_FORWARD_FREEZE_UNIX }), false, 'freeze boundary itself must be excluded');
assert.equal(isKnowledgeForwardEligibleBar({ t:KNOWLEDGE_FORWARD_FREEZE_UNIX + 1 }), true);

const eligibleIndexes = getKnowledgeForwardEligibleIndexes(series);
assert.ok(eligibleIndexes.length > 20, 'synthetic fixture should contain enough post-freeze bars');
assert.ok(eligibleIndexes.every(idx => series[idx].t > KNOWLEDGE_FORWARD_FREEZE_UNIX));

const sourceBefore = JSON.stringify(series);
const runA = runKnowledgeForwardSnapshot({ series, dataSignature:'knowledge-forward-test' });
const runB = runKnowledgeForwardSnapshot({ series, dataSignature:'knowledge-forward-test' });
assert.equal(runA.status, 'complete');
assert.deepEqual(runA, runB, 'prospective snapshot must be deterministic');
assert.equal(JSON.stringify(series), sourceBefore, 'prospective evaluation must not mutate market series');
assert.equal(runA.epoch.id, KNOWLEDGE_FORWARD_EPOCH_ID);
assert.equal(runA.methodology.prospectiveOnly, true);
assert.equal(runA.methodology.preFreezePnlForbidden, true);
assert.equal(runA.methodology.matchedChampionBenchmark, true);
assert.equal(runA.methodology.deterministicEntryBarCost, true);
assert.equal(runA.methodology.automaticSelection, false);
assert.equal(runA.methodology.automaticPromotion, false);
assert.equal(runA.methodology.promotionEligible, false);
assert.equal(runA.methodology.existingForward001Unchanged, true);
assert.ok(runA.observedBarTimes.every(t => t > KNOWLEDGE_FORWARD_FREEZE_UNIX));

const expectedSources = new Set(['champion-001', ...KNOWLEDGE_FORWARD_CANDIDATE_IDS]);
assert.deepEqual(new Set(runA.decisions.map(item => item.sourceId)), expectedSources, 'all four candidates plus matched Champion benchmark must be observed');
assert.ok(runA.decisions.every(item => item.candleTime > KNOWLEDGE_FORWARD_FREEZE_UNIX));
assert.ok(runA.decisions.every(item => item.observedProspectively && !item.usedFutureOutcomeAtDecision));
assert.ok(runA.evidence.length > 0, 'fixture should produce at least one completed prospective paper trade');
for (const item of runA.evidence) {
  assert.ok(expectedSources.has(item.sourceId));
  assert.ok(item.entryTime > KNOWLEDGE_FORWARD_FREEZE_UNIX);
  assert.ok(item.exitTime > KNOWLEDGE_FORWARD_FREEZE_UNIX);
  assert.equal(item.holdingBars, 3);
  assert.ok(Number.isFinite(item.estimatedRoundTripCostBps) && item.estimatedRoundTripCostBps > 0);
  assert.equal(item.costModelVersion, RESEARCH_COST_MODEL_VERSION);
  assert.equal(item.costUsesEntryBarInformationOnly, true);
  assert.equal(item.futureOutcomeUsedByDecision, false);
}
for (const sourceId of expectedSources) {
  const trades = runA.evidence.filter(item => item.sourceId === sourceId).sort((a,b) => a.entryIndex - b.entryIndex);
  for (let i = 1; i < trades.length; i++) assert.ok(trades[i].entryIndex > trades[i - 1].exitIndex, `${sourceId} prospective trades must not overlap`);
}

const costIdx = eligibleIndexes[3];
const costA = estimateResearchRoundTripCostBps(series, costIdx, 'BTCUSD');
assert.ok(Number.isFinite(costA) && costA > 0, 'research cost must be finite and positive');
const costFutureMutated = JSON.parse(JSON.stringify(series));
for (let i = costIdx + 1; i < costFutureMutated.length; i++) {
  costFutureMutated[i].c *= 10;
  costFutureMutated[i].h *= 12;
  costFutureMutated[i].l *= .1;
  costFutureMutated[i].volume *= 100;
}
assert.equal(estimateResearchRoundTripCostBps(costFutureMutated, costIdx, 'BTCUSD'), costA, 'entry-bar cost must not depend on future bars');

const cutoff = series.length - 8;
const cutoffA = runKnowledgeForwardSnapshot({ series, endIndex:cutoff, dataSignature:'cutoff' });
const futureMutated = JSON.parse(JSON.stringify(series));
for (let i = cutoff + 1; i < futureMutated.length; i++) {
  futureMutated[i].c *= 25;
  futureMutated[i].h *= 30;
  futureMutated[i].l *= .02;
  futureMutated[i].volume *= 500;
}
const cutoffB = runKnowledgeForwardSnapshot({ series:futureMutated, endIndex:cutoff, dataSignature:'cutoff' });
assert.deepEqual(cutoffA, cutoffB, 'bars after endIndex must not affect prospective snapshot');

const archive0 = emptyKnowledgeForwardArchive();
const archive1 = mergeKnowledgeForwardArchive(archive0, runA, { updatedAt:'2026-08-17T00:00:00Z' });
const archive2 = mergeKnowledgeForwardArchive(archive1, runA, { updatedAt:'2026-08-17T00:01:00Z' });
assert.equal(archive2.decisions.length, archive1.decisions.length, 'decision merge must deduplicate by decisionKey');
assert.equal(archive2.evidence.length, archive1.evidence.length, 'evidence merge must deduplicate by evidenceKey');
assert.equal(archive2.observedBarTimes.length, archive1.observedBarTimes.length, 'observed bars must deduplicate');
assert.equal(archive2.dataSignatures.length, 1, 'data signatures must deduplicate');
const archiveSummary = summarizeKnowledgeForwardArchive(archive2);
assert.equal(archiveSummary.sourceCount, 5);
assert.deepEqual(new Set(Object.keys(archiveSummary.sources)), expectedSources);
assert.equal(archiveSummary.localBrowserArchive, true);
assert.equal(archiveSummary.serverDurable, false);
assert.equal(archiveSummary.continuity.gapCount, 0);

const gapTimes = [KNOWLEDGE_FORWARD_FREEZE_UNIX + FOUR_HOURS_SECONDS_SAFE(), KNOWLEDGE_FORWARD_FREEZE_UNIX + 3 * FOUR_HOURS];
function FOUR_HOURS_SECONDS_SAFE(){ return FOUR_HOURS; }
const gaps = detectKnowledgeForwardBarGaps(gapTimes);
assert.equal(gaps.gapCount, 1);

const championSource = fs.readFileSync(new URL('../src/engine/shadow-engine.js', import.meta.url), 'utf8');
const liveSource = fs.readFileSync(new URL('../src/live/live-forward-paper.js', import.meta.url), 'utf8');
const oldForwardSource = fs.readFileSync(new URL('../src/research/forward-demo-runner.js', import.meta.url), 'utf8');
for (const source of [championSource, liveSource, oldForwardSource]) {
  assert.ok(!source.includes('knowledge-forward'));
  assert.ok(!source.includes('KnowledgeForward'));
}

console.log('Prospective Knowledge Candidate Epoch v0.15 regression tests passed.');
