import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KNOWLEDGE_CANDIDATE_REGISTRY, KNOWLEDGE_CANDIDATE_LAGS, WAVE1_STRONG_OPPOSITION_THRESHOLD } from '../src/research/knowledge-candidate-registry.js';
import { buildCandidateDecision, runKnowledgeCandidateTournament } from '../src/research/knowledge-candidate-tournament.js';

assert.equal(KNOWLEDGE_CANDIDATE_REGISTRY.candidates.length,4);
assert.deepEqual(KNOWLEDGE_CANDIDATE_REGISTRY.candidates.map(x=>x.id),[
  'candidate-wave1-reference','candidate-playbook-reference','candidate-consensus','candidate-playbook-wave1-veto',
]);
assert.ok(KNOWLEDGE_CANDIDATE_REGISTRY.candidates.every(x=>x.preRegistered&&x.researchOnly&&x.frozenForTournament&&!x.activeInChampion&&!x.activeInLiveForward&&!x.activeInForwardEvidence&&!x.automaticSelection&&!x.automaticPromotion));
assert.equal(KNOWLEDGE_CANDIDATE_REGISTRY.governance.fixedCandidateCount,4);
assert.equal(KNOWLEDGE_CANDIDATE_REGISTRY.governance.generatedCombinations,false);
assert.equal(KNOWLEDGE_CANDIDATE_REGISTRY.governance.rawScoreMinusCost,false);
assert.equal(WAVE1_STRONG_OPPOSITION_THRESHOLD,22);

const w1Long={entryDecision:'ENTER_LONG',knowledgeScore:30};
const w1WeakLong={entryDecision:'NO_ENTRY',knowledgeScore:12};
const w1StrongShort={entryDecision:'ENTER_SHORT',knowledgeScore:-25};
const w2Long={entryDecision:'ENTER_LONG'};
const w2Short={entryDecision:'ENTER_SHORT'};
assert.equal(buildCandidateDecision('candidate-wave1-reference',w1Long,w2Short),'ENTER_LONG');
assert.equal(buildCandidateDecision('candidate-playbook-reference',w1Long,w2Short),'ENTER_SHORT');
assert.equal(buildCandidateDecision('candidate-consensus',w1Long,w2Long),'ENTER_LONG');
assert.equal(buildCandidateDecision('candidate-consensus',w1Long,w2Short),'NO_ENTRY');
assert.equal(buildCandidateDecision('candidate-playbook-wave1-veto',w1WeakLong,w2Long),'ENTER_LONG');
assert.equal(buildCandidateDecision('candidate-playbook-wave1-veto',w1StrongShort,w2Long),'NO_ENTRY');

const FOUR_HOURS=4*60*60;
const series=[];let price=28000;
for(let i=0;i<470;i++){
  const regime=i<120?.0021:i<205?Math.sin(i/5)*.0007:i<310?-.00155:i<365?Math.sin(i/3)*.0004:.0013;
  const cycle=Math.sin(i/10)*.0019;
  const shock=i%83===0?.013:i%97===0?-.012:0;
  const ret=regime+cycle+shock;
  const o=price,c=Math.max(100,price*(1+ret));
  const h=Math.max(o,c)*(1+.004+Math.abs(Math.sin(i/7))*.003);
  const l=Math.min(o,c)*(1-.004-Math.abs(Math.cos(i/8))*.003);
  const volume=110+(i%21)*9+(i%53===0?460:0)+Math.abs(ret)*14000;
  series.push({t:1700000000+i*FOUR_HOURS,o,h,l,c,volume});price=c;
}
const sourceBefore=JSON.stringify(series);
const a=runKnowledgeCandidateTournament({series,endIndex:450,estimatedRoundTripCostBps:10,dataSignature:'candidate-test'});
const b=runKnowledgeCandidateTournament({series,endIndex:450,estimatedRoundTripCostBps:10,dataSignature:'candidate-test'});
assert.equal(a.status,'complete');
assert.deepEqual(a,b,'Candidate Tournament must be deterministic');
assert.equal(JSON.stringify(series),sourceBefore,'Candidate Tournament must not mutate source series');
assert.equal(a.results.length,4);
assert.equal(a.displayRanking.length,4);
assert.equal(a.methodology.fixedCandidateCount,4);
assert.equal(a.methodology.generatedCombinations,false);
assert.equal(a.methodology.combinatorialSearch,false);
assert.equal(a.methodology.rawScoreMinusCost,false);
assert.equal(a.methodology.costAppliedToRealizedTradeReturnsOnly,true);
assert.equal(a.methodology.noFittingPerformed,true);
assert.equal(a.methodology.pristineUntouchedOOS,false);
assert.equal(a.methodology.automaticSelection,false);
assert.equal(a.methodology.automaticPromotion,false);
assert.equal(a.methodology.championMutation,false);
assert.equal(a.methodology.usedByLiveDecisionEngine,false);
assert.equal(a.methodology.usedByForwardEvidence,false);
assert.equal(a.promotionProtocol.currentlyPromotionEligible,false);
assert.equal(a.promotionProtocol.prospectiveEvidenceRequired,true);
assert.equal(a.benchmark.id,'champion-001');
assert.equal(a.holdoutWindows.length,3);
for(const result of a.results){
  assert.equal(result.nullControl.replicates.length,KNOWLEDGE_CANDIDATE_LAGS.length);
  assert.equal(result.holdout.folds.length,3);
  assert.equal(result.diagnostic.promotionEligible,false);
  for(let i=1;i<result.holdout.folds.length;i++) assert.ok(result.holdout.folds[i].startIndex>result.holdout.folds[i-1].endIndex);
}

const alteredFuture=JSON.parse(JSON.stringify(series));
for(let i=451;i<alteredFuture.length;i++){alteredFuture[i].c*=20;alteredFuture[i].h*=22;alteredFuture[i].l*=.02;alteredFuture[i].volume*=500;}
const noFuture=runKnowledgeCandidateTournament({series:alteredFuture,endIndex:450,estimatedRoundTripCostBps:10,dataSignature:'candidate-test'});
assert.deepEqual(a,noFuture,'Bars after tournament endIndex must not affect results');

for(const path of ['../src/engine/shadow-engine.js','../src/live/live-forward-paper.js','../src/research/forward-demo-runner.js','../src/knowledge/human-knowledge-engine.js','../src/knowledge/playbook-engine.js']){
  const source=fs.readFileSync(new URL(path,import.meta.url),'utf8');
  assert.ok(!source.includes('knowledge-candidate-tournament'),'Frozen/live/source engines must not import tournament output');
  assert.ok(!source.includes('KnowledgeCandidateTournament'),'Frozen/live/source engines must not depend on tournament output');
}
console.log('Knowledge Candidate Tournament v0.14 regression tests passed.');
