import assert from 'node:assert/strict';
import { buildResearchJson, flattenDecisionEvent, researchEventsToCsv } from '../src/research/research-export.js';

const event = {
  eventId: '=unsafe-event-id',
  recordedAt: 123456,
  strategyVersion: 'champion-001',
  instrument: 'BTCUSD',
  timeframeHours: 4,
  candleTime: 1700000000,
  barIndex: 120,
  dataSourceId: 'kraken-spot-btcusd-4h-v1',
  dataSourceType: 'real',
  dataSignature: 'a:b:520',
  researchEligible: true,
  engineVersion: '0.4-fixed-experts-policy',
  expertSetVersion: 'fixed-experts-0.1',
  regime: '上昇トレンド',
  market: { price: 65000.25, fastMA: 64900, slowMA: 64000, rsi: 61.2, atrPct: 1.4 },
  scores: { rawAlphaScore: 18, decisionScore: 49.2, confidenceScore: 68, timingScore: 71, riskScore: 35 },
  costs: { estimatedRoundTripCostBps: 12.4 },
  entryDecision: 'ENTER_LONG',
  policyDecision: 'ENTER_LONG',
  legacyAction: 'BUY',
  experts: [
    { id: 'trend', score: 22 },
    { id: 'momentum', score: 4 },
    { id: 'breakout', score: 10 },
  ],
  counterfactual: {
    status: 'complete',
    outcomes: [
      { horizonBars: 1, long: { netReturnBps: 15 }, short: { netReturnBps: -39 } },
      { horizonBars: 3, long: { netReturnBps: 42 }, short: { netReturnBps: -66 }, longMfeBps: 88, longMaeBps: -21, shortMfeBps: 21, shortMaeBps: -88 },
      { horizonBars: 6, long: { netReturnBps: 73 }, short: { netReturnBps: -97 } },
    ],
  },
};

const flat = flattenDecisionEvent(event);
assert.equal(flat.trendExpertScore, 22);
assert.equal(flat.cfLong3NetBps, 42);
assert.equal(flat.cfShort3MaeBps, -88);

const csv = researchEventsToCsv([event]);
assert.ok(csv.startsWith('\uFEFF'));
assert.ok(csv.includes('cfLong3NetBps'));
assert.ok(csv.includes("'=unsafe-event-id"), 'CSV formula-like text must be spreadsheet-safe');

const strategyRegistry = {
  version: 'strategy-registry-0.1',
  champion: { id: 'champion-001', frozen: true },
  challengers: [{ id: 'challenger-001-stricter-entry' }],
  governance: { automaticPromotion: false },
};
const challengerEvaluation = {
  version: 'challenger-shadow-0.1',
  status: 'complete',
  methodology: { automaticPromotion: false, promotionEligible: false },
  results: [{ id: 'champion-001' }, { id: 'challenger-001-stricter-entry' }],
};
const walkForwardEvaluation = {
  version: 'walk-forward-0.1',
  status: 'complete',
  methodology: {
    folds: 3,
    embargoBars: 3,
    noFittingPerformed: true,
    pristineUntouchedOOS: false,
    promotionEligible: false,
  },
  folds: [{ fold: 1 }, { fold: 2 }, { fold: 3 }],
  results: [{ id: 'champion-001', positiveFolds: 2 }],
};
const forwardDemoEvaluation = {
  version: 'forward-demo-0.1',
  status: 'complete',
  epoch: {
    id: 'forward-001',
    frozenAtIso: '2026-08-16T14:27:00Z',
    frozenAtUnix: 1786890420,
    governance: { automaticPromotion: false, promotionEligible: false },
  },
  observedPostFreezeBars: 3,
  completedProspectiveTrades: 1,
  methodology: { prospectiveOnly: true, automaticPromotion: false, promotionEligible: false },
  archive: { trades: [{ evidenceKey: 'forward-001:champion-001:1:2' }] },
};
const nullMarketEvaluation = {
  version: 'null-market-controls-0.1',
  status: 'complete',
  methodology: { formalPValue: false, usedByDecisionEngine: false },
  methods: [{ id: 'return_shuffle', screening: 'null-overlap' }],
};
const jsonText = buildResearchJson({
  events: [event],
  baselineEvaluation: { status: 'complete', results: [] },
  strategyRegistry,
  challengerEvaluation,
  walkForwardEvaluation,
  forwardDemoEvaluation,
  nullMarketEvaluation,
  dataMeta: { provider: 'Kraken public OHLC' },
});
const parsed = JSON.parse(jsonText);
assert.equal(parsed.exportVersion, 'research-export-0.5');
assert.equal(parsed.eventCount, 1);
assert.equal(parsed.decisionEvents[0].eventId, '=unsafe-event-id');
assert.equal(parsed.baselineEvaluation.status, 'complete');
assert.equal(parsed.strategyRegistry.champion.id, 'champion-001');
assert.equal(parsed.strategyRegistry.governance.automaticPromotion, false);
assert.equal(parsed.challengerEvaluation.methodology.promotionEligible, false);
assert.equal(parsed.walkForwardEvaluation.version, 'walk-forward-0.1');
assert.equal(parsed.walkForwardEvaluation.methodology.embargoBars, 3);
assert.equal(parsed.walkForwardEvaluation.methodology.pristineUntouchedOOS, false);
assert.equal(parsed.forwardDemoEvaluation.version, 'forward-demo-0.1');
assert.equal(parsed.forwardDemoEvaluation.epoch.id, 'forward-001');
assert.equal(parsed.forwardDemoEvaluation.epoch.frozenAtUnix, 1786890420);
assert.equal(parsed.forwardDemoEvaluation.methodology.promotionEligible, false);
assert.equal(parsed.nullMarketEvaluation.version, 'null-market-controls-0.1');
assert.equal(parsed.nullMarketEvaluation.methodology.formalPValue, false);
assert.ok(parsed.notes.some(note => note.includes('not IID')));
assert.ok(parsed.notes.some(note => note.includes('automatically promote')));
assert.ok(parsed.notes.some(note => note.includes('holdout diagnostic')));
assert.ok(parsed.notes.some(note => note.includes('Prospective Forward Demo')));
assert.ok(parsed.notes.some(note => note.includes('strictly after')));
assert.ok(parsed.notes.some(note => note.includes('Null95')));
assert.ok(parsed.notes.some(note => note.includes('decision engine')));

console.log('Research export regression tests passed.');
