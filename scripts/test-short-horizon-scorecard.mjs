import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createScorecardState,updateScorecardState,buildScorecardSnapshot } from '../src/short-horizon/prospective-scorecard.js';
import { processScorecardOnce } from './local-node/short-horizon-scorecard-worker.mjs';

const state=createScorecardState();
const base={symbol:'BTC/USD',horizonSec:15,provenance:{inputWindowId:'w'}};
updateScorecardState(state,{...base,outcomeId:'f',experimentId:'BOUNDARY_CONCORDANCE_V1',sampleRole:'PRIMARY',decision:'LONG',directionalReturnBps:2,result:'WIN'});
updateScorecardState(state,{...base,outcomeId:'a',experimentId:'BOUNDARY_ADAPTIVE_V1',sampleRole:'ADAPTIVE',decision:'LONG',directionalReturnBps:3,result:'WIN'});
updateScorecardState(state,{...base,outcomeId:'n',experimentId:'BOUNDARY_HASH_NULL_V1',sampleRole:'NULL',decision:'SHORT',directionalReturnBps:-2,result:'LOSS'});
const snap=buildScorecardSnapshot(state);
assert.equal(snap.comparisons.frozenVsAdaptive.pairedSamples,1);
assert.equal(snap.comparisons.frozenVsAdaptive.meanDirectionalDeltaBps,1);
assert.equal(snap.comparisons.primaryVsNull.meanDirectionalDeltaBps,4);
assert.equal(snap.governance.automaticPromotion,false);

const root=fs.mkdtempSync(path.join(os.tmpdir(),'vt-v057-'));
const dir=path.join(root,'research','kraken','prospective-outcomes','BTCUSD','2026','08','22');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'00.ndjson'),[
  {...base,outcomeId:'f',experimentId:'BOUNDARY_CONCORDANCE_V1',sampleRole:'PRIMARY',decision:'LONG',directionalReturnBps:2,result:'WIN'},
  {...base,outcomeId:'a',experimentId:'BOUNDARY_ADAPTIVE_V1',sampleRole:'ADAPTIVE',decision:'LONG',directionalReturnBps:3,result:'WIN'},
  {...base,outcomeId:'n',experimentId:'BOUNDARY_HASH_NULL_V1',sampleRole:'NULL',decision:'SHORT',directionalReturnBps:-2,result:'LOSS'},
].map(JSON.stringify).join('\n')+'\n','utf8');
const state2={...createScorecardState(),files:{},parseErrors:0};const snap2=processScorecardOnce(root,state2,1);
assert.equal(snap2.comparisons.frozenVsAdaptive.meanDirectionalDeltaBps,1);
assert.equal(snap2.comparisons.primaryVsNull.meanDirectionalDeltaBps,4);
console.log('v0.57 scorecard tests PASS');
