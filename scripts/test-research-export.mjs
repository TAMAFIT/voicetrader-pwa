import assert from 'node:assert/strict';
import { buildResearchJson, flattenDecisionEvent, researchEventsToCsv } from '../src/research/research-export.js';

const event = {
  eventId:'=unsafe-event-id', recordedAt:123456, strategyVersion:'champion-001', instrument:'BTCUSD', timeframeHours:4,
  candleTime:1700000000, barIndex:120, dataSourceId:'kraken-spot-btcusd-4h-v1', dataSourceType:'real', dataSignature:'a:b:520', researchEligible:true,
  engineVersion:'0.4-fixed-experts-policy', expertSetVersion:'fixed-experts-0.1', regime:'上昇トレンド',
  market:{ price:65000.25,fastMA:64900,slowMA:64000,rsi:61.2,atrPct:1.4 },
  scores:{ rawAlphaScore:18,decisionScore:49.2,confidenceScore:68,timingScore:71,riskScore:35 }, costs:{ estimatedRoundTripCostBps:12.4 },
  entryDecision:'ENTER_LONG',policyDecision:'ENTER_LONG',legacyAction:'BUY',
  experts:[{ id:'trend',score:22 },{ id:'momentum',score:4 },{ id:'breakout',score:10 }],
  counterfactual:{ status:'complete',outcomes:[
    { horizonBars:1,long:{ netReturnBps:15 },short:{ netReturnBps:-39 } },
    { horizonBars:3,long:{ netReturnBps:42 },short:{ netReturnBps:-66 },longMfeBps:88,longMaeBps:-21,shortMfeBps:21,shortMaeBps:-88 },
    { horizonBars:6,long:{ netReturnBps:73 },short:{ netReturnBps:-97 } },
  ]},
};

const flat = flattenDecisionEvent(event);
assert.equal(flat.trendExpertScore,22);
assert.equal(flat.cfLong3NetBps,42);
assert.equal(flat.cfShort3MaeBps,-88);
const csv = researchEventsToCsv([event]);
assert.ok(csv.startsWith('\uFEFF'));
assert.ok(csv.includes('cfLong3NetBps'));
assert.ok(csv.includes("'=unsafe-event-id"),'CSV formula-like text must be spreadsheet-safe');

const strategyRegistry = { version:'strategy-registry-0.1',champion:{ id:'champion-001',frozen:true },challengers:[{ id:'challenger-001-stricter-entry' }],governance:{ automaticPromotion:false } };
const challengerEvaluation = { version:'challenger-shadow-0.1',status:'complete',methodology:{ automaticPromotion:false,promotionEligible:false },results:[{ id:'champion-001' },{ id:'challenger-001-stricter-entry' }] };
const knowledgeEvaluation = {
  registry:{ version:'human-knowledge-registry-0.1',philosophy:{ adaptiveWeights:false,automaticPromotion:false },items:[{ id:'TREND_MACD_001',researchOnly:true }] },
  latestAnalysis:{ version:'human-knowledge-wave1-0.1',knowledgeScore:17.5,scoreIsExpectedReturn:false,confidenceIsCalibratedProbability:false,governance:{ championMutation:false,usedByLiveDecisionEngine:false,usedByForwardEvidence:false } },
  shadowEvaluation:{ version:'knowledge-shadow-0.1',status:'complete',methodology:{ sameSeriesDiagnosticOnly:true,championMutation:false } },
  attributionEvaluation:{ version:'knowledge-attribution-0.1',status:'complete',expertAblations:[{ id:'TREND_MACD_001',deltaAvgNetBps:2.3,diagnostic:'supportive-sensitivity' }],familyAblations:[{ family:'trend',deltaAvgNetBps:4.2,negativeControl:{ screening:'null-overlap',avgNetBpsNull:{ p95:8.5,exceedanceRatePct:25 } } }],methodology:{ causalAttribution:false,familyNullUsesPastSignalsOnly:true,formalPValue:false,automaticPruning:false,usedByLiveDecisionEngine:false,usedByForwardEvidence:false } },
};
const playbookEvaluation = {
  registry:{ version:'human-playbook-registry-0.1',items:[{ id:'PB_TREND_PULLBACK_001',preRegistered:true,researchOnly:true,profitabilityClaim:false }],philosophy:{ automaticPromotion:false,optimizer:false } },
  latestAnalysis:{ version:'human-playbook-wave2-0.1',entryDecision:'NO_ENTRY',playbookScore:12.5,scoreIsExpectedReturn:false,governance:{ championMutation:false,usedByLiveDecisionEngine:false,usedByForwardEvidence:false,automaticPruning:false } },
  shadowEvaluation:{ version:'playbook-shadow-0.1',status:'complete',summary:{ trades:8,avgNetBps:3.2 },methodology:{ sameSeriesDiagnosticOnly:true,automaticPromotion:false } },
  attributionEvaluation:{ version:'playbook-attribution-0.1',status:'complete',playbookAblations:[{ id:'PB_TREND_PULLBACK_001',deltaAvgNetBps:1.2 }],archetypeAblations:[{ archetype:'continuation',negativeControl:{ screening:'null-overlap' } }],methodology:{ causalAttribution:false,formalPValue:false,automaticPruning:false } },
  walkForwardEvaluation:{ version:'playbook-walk-forward-0.1',status:'complete',folds:3,methodology:{ noFittingPerformed:true,pristineUntouchedOOS:false,promotionEligible:false } },
};
const walkForwardEvaluation = { version:'walk-forward-0.1',status:'complete',methodology:{ folds:3,embargoBars:3,noFittingPerformed:true,pristineUntouchedOOS:false,promotionEligible:false },folds:[{ fold:1 },{ fold:2 },{ fold:3 }],results:[{ id:'champion-001',positiveFolds:2 }] };
const forwardDemoEvaluation = { version:'forward-demo-0.1',status:'complete',epoch:{ id:'forward-001',frozenAtIso:'2026-08-16T14:27:00Z',frozenAtUnix:1786890420,governance:{ automaticPromotion:false,promotionEligible:false } },observedPostFreezeBars:3,completedProspectiveTrades:1,methodology:{ prospectiveOnly:true,automaticPromotion:false,promotionEligible:false },archive:{ trades:[{ evidenceKey:'forward-001:champion-001:1:2' }] } };
const nullMarketEvaluation = { version:'null-market-controls-0.1',status:'complete',methodology:{ formalPValue:false,usedByDecisionEngine:false },methods:[{ id:'return_shuffle',screening:'null-overlap' }] };

const parsed = JSON.parse(buildResearchJson({
  events:[event],baselineEvaluation:{ status:'complete',results:[] },strategyRegistry,challengerEvaluation,knowledgeEvaluation,playbookEvaluation,walkForwardEvaluation,forwardDemoEvaluation,nullMarketEvaluation,dataMeta:{ provider:'Kraken public OHLC' },
}));
assert.equal(parsed.exportVersion,'research-export-0.8');
assert.equal(parsed.eventCount,1);
assert.equal(parsed.decisionEvents[0].eventId,'=unsafe-event-id');
assert.equal(parsed.strategyRegistry.champion.id,'champion-001');
assert.equal(parsed.challengerEvaluation.methodology.promotionEligible,false);
assert.equal(parsed.knowledgeEvaluation.attributionEvaluation.methodology.causalAttribution,false);
assert.equal(parsed.playbookEvaluation.registry.version,'human-playbook-registry-0.1');
assert.equal(parsed.playbookEvaluation.latestAnalysis.scoreIsExpectedReturn,false);
assert.equal(parsed.playbookEvaluation.latestAnalysis.governance.usedByLiveDecisionEngine,false);
assert.equal(parsed.playbookEvaluation.attributionEvaluation.methodology.causalAttribution,false);
assert.equal(parsed.playbookEvaluation.attributionEvaluation.methodology.automaticPruning,false);
assert.equal(parsed.playbookEvaluation.walkForwardEvaluation.methodology.pristineUntouchedOOS,false);
assert.equal(parsed.walkForwardEvaluation.methodology.embargoBars,3);
assert.equal(parsed.forwardDemoEvaluation.epoch.frozenAtUnix,1786890420);
assert.equal(parsed.nullMarketEvaluation.methodology.formalPValue,false);
assert.ok(parsed.notes.some(note => note.includes('not IID')));
assert.ok(parsed.notes.some(note => note.includes('Human Trading Playbook Engine Wave 2')));
assert.ok(parsed.notes.some(note => note.includes('leave-one-Playbook-out')));
assert.ok(parsed.notes.some(note => note.includes('not pristine untouched OOS')));
assert.ok(parsed.notes.some(note => note.includes('Prospective Forward Demo')));
assert.ok(parsed.notes.some(note => note.includes('Null95')));
assert.ok(parsed.notes.some(note => note.includes('decision engine')));

console.log('Research export regression tests passed.');
