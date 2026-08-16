import assert from 'node:assert/strict';
import { runBaselineSuite } from '../src/research/baseline-runner.js';
import { evaluateStrategyDecision, runChallengerShadow } from '../src/research/challenger-runner.js';
import {
  MAX_CHALLENGERS,
  STRATEGY_REGISTRY,
  getChampionStrategy,
  getChallengerStrategies,
} from '../src/research/strategy-registry.js';

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

const championStrategy = getChampionStrategy();
const challengers = getChallengerStrategies();
assert.equal(championStrategy.id, 'champion-001');
assert.equal(championStrategy.frozen, true);
assert.equal(championStrategy.liveDecisionEngine, true);
assert.equal(challengers.length, MAX_CHALLENGERS);
assert.equal(MAX_CHALLENGERS, 3);
assert.equal(new Set(challengers.map(item => item.id)).size, challengers.length);
assert.equal(STRATEGY_REGISTRY.governance.automaticPromotion, false);
assert.equal(STRATEGY_REGISTRY.governance.parameterSweep, false);
assert.equal(STRATEGY_REGISTRY.governance.dynamicWeightLearning, false);
assert.equal(STRATEGY_REGISTRY.governance.sameSeriesResultsCanPromoteChampion, false);
assert.ok(Object.isFrozen(STRATEGY_REGISTRY));
assert.ok(Object.isFrozen(STRATEGY_REGISTRY.challengers));
assert.ok(STRATEGY_REGISTRY.challengers.every(Object.isFrozen));

const syntheticAnalysis = {
  entryDecision: 'ENTER_LONG',
  dir: 'UP',
  conf: 62,
  decisionScore: 45,
  rawAlphaScore: 12,
  timing: 70,
  risk: 40,
  experts: {
    results: [
      { id: 'trend', score: 10 },
      { id: 'momentum', score: -3 },
      { id: 'breakout', score: 0 },
    ],
  },
};
assert.equal(evaluateStrategyDecision(syntheticAnalysis, championStrategy).entryDecision, 'ENTER_LONG');
assert.equal(evaluateStrategyDecision(syntheticAnalysis, challengers[0]).entryDecision, 'NO_ENTRY', 'stricter challenger should reject marginal Champion entry');
assert.equal(evaluateStrategyDecision(syntheticAnalysis, challengers[2]).entryDecision, 'NO_ENTRY', 'momentum confirmation should gate conflicting momentum');

const series = makeSeries();
const originalSeries = JSON.stringify(series);
const options = {
  series,
  endIndex: series.length - 1,
  estimatedRoundTripCostBps: 12.5,
  dataSignature: 'challenger-test-series',
};
const first = runChallengerShadow(options);
const second = runChallengerShadow(options);

assert.equal(first.status, 'complete');
assert.equal(first.version, 'challenger-shadow-0.1');
assert.equal(first.results.length, 4);
assert.deepEqual(first, second, 'Challenger Shadow must be deterministic for the same input');
assert.equal(JSON.stringify(series), originalSeries, 'Challenger Shadow must not mutate the source market series');
assert.equal(first.methodology.challengerCount, 3);
assert.equal(first.methodology.challengerLimit, 3);
assert.equal(first.methodology.parameterSweep, false);
assert.equal(first.methodology.selfLearning, false);
assert.equal(first.methodology.dynamicWeightLearning, false);
assert.equal(first.methodology.automaticPromotion, false);
assert.equal(first.methodology.promotionEligible, false);
assert.equal(first.methodology.outOfSample, false);
assert.equal(first.methodology.usedByLiveDecisionEngine, false);

const baseline = runBaselineSuite(options);
const baselineChampion = baseline.results.find(result => result.id === 'champion');
const registryChampion = first.results.find(result => result.id === 'champion-001');
assert.ok(baselineChampion && registryChampion);
for (const field of ['trades', 'longTrades', 'shortTrades', 'returnPct', 'winRatePct', 'avgNetBps', 'profitFactor', 'maxDrawdownPct', 'exposurePct']) {
  assert.equal(registryChampion[field], baselineChampion[field], `frozen Champion must match Baseline Champion field ${field}`);
}
assert.deepEqual(registryChampion.deltaVsChampion, { returnPct: 0, avgNetBps: 0, trades: 0 });

for (const challenger of first.results.filter(result => result.role === 'challenger')) {
  assert.equal(challenger.liveDecisionEngine, false);
  assert.equal(challenger.frozenDefinition, true);
  assert.ok(challenger.hypothesis.length > 20);
  assert.ok(Number.isFinite(challenger.returnPct));
  assert.ok(Number.isFinite(challenger.maxDrawdownPct));
}

console.log('Strategy Registry and bounded Challenger Shadow regression tests passed.');
