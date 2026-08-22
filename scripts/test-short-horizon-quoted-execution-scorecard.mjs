import assert from 'node:assert/strict';
import { createScorecardState,updateScorecardState,buildScorecardSnapshot } from '../src/short-horizon/prospective-scorecard.js';
const state=createScorecardState();
const base={experimentId:'BOUNDARY_CONCORDANCE_V1',sampleRole:'PRIMARY',symbol:'BTC/USD',horizonSec:15,evaluationPartition:{role:'BLIND_EXAM'},decision:'LONG',provenance:{inputWindowId:'w'}};
updateScorecardState(state,{...base,outcomeId:'o1',directionalReturnBps:2,result:'WIN',quotedExecution:{quotedDirectionalReturnBps:-1},quotedResult:'LOSS'});
const snap=buildScorecardSnapshot(state);const g=snap.groups[0];assert.equal(g.mid.wins,1);assert.equal(g.quoted.losses,1);assert.equal(g.partitionRole,'BLIND_EXAM');assert.equal(snap.governance.observedSpreadEmbeddedInQuoted,true);assert.equal(snap.governance.actualNetEvAvailable,false);console.log('v0.61 quoted scorecard tests PASS');
