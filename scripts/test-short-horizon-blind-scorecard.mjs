import assert from 'node:assert/strict';
import { createScorecardState,updateScorecardState,buildScorecardSnapshot } from '../src/short-horizon/prospective-scorecard.js';
const state=createScorecardState();
for(const role of ['LEARNING_STREAM','BLIND_EXAM']){
  const base={symbol:'BTC/USD',horizonSec:15,evaluationPartition:{role},provenance:{inputWindowId:`w-${role}`}};
  updateScorecardState(state,{...base,outcomeId:`f-${role}`,experimentId:'BOUNDARY_CONCORDANCE_V1',sampleRole:'PRIMARY',decision:'LONG',directionalReturnBps:2,result:'WIN'});
  updateScorecardState(state,{...base,outcomeId:`a-${role}`,experimentId:'BOUNDARY_ADAPTIVE_V1',sampleRole:'ADAPTIVE',decision:'LONG',directionalReturnBps:role==='BLIND_EXAM'?1:3,result:'WIN'});
  updateScorecardState(state,{...base,outcomeId:`n-${role}`,experimentId:'BOUNDARY_HASH_NULL_V1',sampleRole:'NULL',decision:'SHORT',directionalReturnBps:-2,result:'LOSS'});
}
const snap=buildScorecardSnapshot(state,{minBlindPaired:2});
assert.equal(snap.comparisons.frozenVsAdaptive.LEARNING_STREAM.meanDirectionalDeltaBps,1);
assert.equal(snap.comparisons.frozenVsAdaptive.BLIND_EXAM.meanDirectionalDeltaBps,-1);
assert.equal(snap.blindExamReadiness.status,'INSUFFICIENT_BLIND_SAMPLE');
assert.equal(snap.governance.blindAndLearningSeparated,true);
assert.equal(snap.governance.automaticPromotion,false);
console.log('v0.59 blind scorecard tests PASS');
