import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FORWARD_EPOCH } from '../src/research/forward-epoch.js';
import {
  LIVE_FORWARD_VERSION,
  createLiveForwardState,
  processLiveForwardSnapshot,
  summarizeLiveForwardState,
} from '../src/live/live-forward-paper.js';
import { LiveForwardStore, LIVE_FORWARD_STORAGE_KEY } from '../src/live/live-forward-store.js';

const INTERVAL = 4 * 60 * 60;
const frozenAtUnix = 70 * INTERVAL + 123;
const epoch = JSON.parse(JSON.stringify(FORWARD_EPOCH));
epoch.frozenAtUnix = frozenAtUnix;
epoch.frozenAtIso = 'test-freeze';
epoch.frozenAtJst = 'test-freeze';

const firstEligible = 71 * INTERVAL;
const baseBars = [];
for (let slot = 20; slot <= 80; slot++) {
  const t = slot * INTERVAL;
  const price = 100 + (slot - 20) * 2;
  baseBars.push({ t, o: price - 1, h: price + 2, l: price - 2, c: price, volume: 100 });
}

const realMeta = {
  sourceType: 'real',
  researchEligible: true,
  instrument: 'BTCUSD',
  timeframeHours: 4,
  signature: 'test-real-series',
};

function sliceThrough(time) {
  return baseBars.filter(bar => bar.t <= time);
}

function fakeAnalysis() {
  return {
    engineVersion: epoch.provenance.shadowEngineVersion,
    entryDecision: 'ENTER_LONG',
    dir: 'UP',
    conf: 70,
    decisionScore: 60,
    rawAlphaScore: 20,
    timing: 75,
    risk: 30,
    experts: { results: [] },
  };
}

const goodEngineFactory = () => ({
  version: epoch.provenance.shadowEngineVersion,
  analyze: () => fakeAnalysis(),
});
const goodExecutionFactory = () => ({
  profile: epoch.provenance.executionProfile,
  estimateRoundTripCostBps: () => 10,
});

function run(series, state = null, overrides = {}) {
  return processLiveForwardSnapshot({
    series,
    meta: realMeta,
    state,
    observedAt: 123456789,
    epoch,
    engineFactory: goodEngineFactory,
    executionFactory: goodExecutionFactory,
    ...overrides,
  });
}

// Freeze boundary: only candles strictly after the frozen instant are admitted.
const throughFirst = sliceThrough(firstEligible);
const firstRun = run(throughFirst);
assert.equal(firstRun.status, 'running');
assert.equal(firstRun.processedNow, 1);
assert.equal(firstRun.state.lastProcessedCandleTime, firstEligible);
assert.equal(firstRun.state.position.entryTime, firstEligible);
assert.ok(firstRun.state.audit.every(event => event.candleTime > frozenAtUnix));

// Exact-once: repeating the same snapshot cannot duplicate decisions or trades.
const repeat = run(throughFirst, firstRun.state);
assert.equal(repeat.status, 'waiting');
assert.equal(repeat.processedNow, 0);
assert.equal(repeat.state.processedCandles, 1);
assert.equal(repeat.state.trades.length, 0);

// Multi-candle catch-up: resume later, exit exactly after 3 subsequent 4H bars, and do not re-enter on the exit candle.
const throughThird = sliceThrough(firstEligible + 2 * INTERVAL);
const preCatchup = run(throughThird);
assert.equal(preCatchup.state.processedCandles, 3);
assert.equal(preCatchup.state.position.entryTime, firstEligible);
assert.equal(preCatchup.state.trades.length, 0);

const throughSixth = sliceThrough(firstEligible + 5 * INTERVAL);
const caughtUp = run(throughSixth, preCatchup.state);
assert.equal(caughtUp.processedNow, 3);
assert.equal(caughtUp.state.processedCandles, 6);
assert.equal(caughtUp.state.trades.length, 1);
const closed = caughtUp.state.trades[0];
assert.equal(closed.entryTime, firstEligible);
assert.equal(closed.exitTime, firstEligible + 3 * INTERVAL);
assert.equal(closed.holdingBars, 3);
assert.equal(closed.exitReason, 'fixed-horizon-time-exit');
assert.equal(caughtUp.state.position.entryTime, firstEligible + 4 * INTERVAL, 'exit candle must be consumed; next candle may open the next trade');
assert.notEqual(caughtUp.state.position.entryTime, closed.exitTime, 'no re-entry on exit candle');

// Deterministic expected-cost P&L.
const expectedGross = (closed.exitPrice / closed.entryPrice - 1) * 10000;
assert.equal(closed.grossReturnBps, Math.round(expectedGross * 100) / 100);
assert.equal(closed.netReturnBps, Math.round((expectedGross - 10) * 100) / 100);
const expectedEquity = 100000 * (1 + closed.netReturnBps / 10000);
assert.equal(Math.round(caughtUp.state.equity * 10000) / 10000, Math.round(expectedEquity * 10000) / 10000);

// Replay determinism from a clean state.
const fullA = run(throughSixth);
const fullB = run(throughSixth);
assert.deepEqual(fullA.state, fullB.state);

// Source series must never be mutated.
const immutableSource = sliceThrough(firstEligible + 5 * INTERVAL);
const before = JSON.stringify(immutableSource);
run(immutableSource);
assert.equal(JSON.stringify(immutableSource), before);

// Continuity gap fails closed instead of silently skipping a 4H candle.
const oneBarState = firstRun.state;
const gapSeries = sliceThrough(firstEligible + 2 * INTERVAL).filter(bar => bar.t !== firstEligible + INTERVAL);
const gap = run(gapSeries, oneBarState);
assert.equal(gap.status, 'blocked');
assert.equal(gap.reason, 'closed-candle-continuity-gap');
assert.equal(gap.expectedCandleTime, firstEligible + INTERVAL);

// Cached/synthetic sources cannot advance live paper trading.
const cached = processLiveForwardSnapshot({
  series: throughSixth,
  meta: { ...realMeta, sourceType: 'cached-real' },
  epoch,
  engineFactory: goodEngineFactory,
  executionFactory: goodExecutionFactory,
});
assert.equal(cached.status, 'blocked');
assert.match(cached.reason, /^non-live-source:/);

// Frozen runtime drift fails closed.
const drift = run(throughFirst, null, {
  engineFactory: () => ({ version: 'changed-engine', analyze: () => fakeAnalysis() }),
});
assert.equal(drift.status, 'blocked');
assert.equal(drift.reason, 'frozen-runtime-version-mismatch');
assert.ok(drift.runtimeErrors.some(error => error.startsWith('shadow-engine-version:')));

// Storage/resume survives reload without creating duplicates.
class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}
const memory = new MemoryStorage();
const store = new LiveForwardStore({ storage: memory, epoch });
store.save(caughtUp.state);
const resumed = store.load();
assert.deepEqual(resumed, caughtUp.state);
assert.ok(memory.getItem(LIVE_FORWARD_STORAGE_KEY));
const resumedSame = run(throughSixth, resumed);
assert.equal(resumedSame.processedNow, 0);
assert.equal(resumedSame.state.trades.length, 1);
assert.equal(new Set(resumedSame.state.trades.map(trade => trade.tradeId)).size, resumedSame.state.trades.length);

// Summary is stable and reports the open paper position separately from realized equity.
const summary = summarizeLiveForwardState(caughtUp.state, throughSixth.at(-1).c);
assert.equal(summary.trades, 1);
assert.equal(summary.processedCandles, 6);
assert.equal(summary.position.side, 'LONG');
assert.ok(Number.isFinite(summary.position.unrealizedGrossBps));

// Architectural guardrail: live-paper code must not import or mutate the Forward Evidence archive.
const liveSource = fs.readFileSync(new URL('../src/live/live-forward-paper.js', import.meta.url), 'utf8');
const storeSource = fs.readFileSync(new URL('../src/live/live-forward-store.js', import.meta.url), 'utf8');
assert.ok(!liveSource.includes('forward-evidence-store'));
assert.ok(!storeSource.includes('forward-evidence-store'));
assert.ok(!liveSource.includes('ForwardEvidenceStore'));
assert.ok(!storeSource.includes('ForwardEvidenceStore'));

const fresh = createLiveForwardState({ epoch, now: 1 });
assert.equal(fresh.version, LIVE_FORWARD_VERSION);
assert.equal(fresh.runtime.realMoneyRouting, false);
assert.equal(fresh.runtime.forwardEvidenceCoupled, false);
assert.equal(fresh.runtime.automaticPromotion, false);

console.log('Live forward paper trading regression tests passed.');
