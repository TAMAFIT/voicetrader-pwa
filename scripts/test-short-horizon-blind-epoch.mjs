import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assignEvaluationPartition,attachEvaluationPartition,adaptiveLearningAllowed,buildBlindLedgerRecord } from '../src/short-horizon/blind-epoch.js';
import { createAdaptiveState } from '../src/short-horizon/adaptive-experiment.js';
import { processProspectiveOnce } from './local-node/short-horizon-prospective-worker.mjs';

let blindId=null,learningId=null;
for(let i=0;i<100;i++){const id=`w${i}`;const role=assignEvaluationPartition(id).role;if(role==='BLIND_EXAM'&&!blindId)blindId=id;if(role==='LEARNING_STREAM'&&!learningId)learningId=id;}
assert.ok(blindId);assert.ok(learningId);
const s=attachEvaluationPartition({signalId:'s',inputWindowId:blindId,symbol:'BTC/USD',experimentId:'x'});
const o={outcomeId:'o',horizonSec:15,maturedAtMs:1,governance:{signalImmutable:true}};
assert.equal(s.evaluationPartition.role,'BLIND_EXAM');assert.equal(adaptiveLearningAllowed(s,o),false);assert.equal(buildBlindLedgerRecord(s,o).status,'RETIRED_EXPOSED');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'vt-v058-'));const end=Date.parse('2026-08-22T00:04:55Z');
const window={windowId:blindId,symbol:'BTC/USD',windowSec:5,endTimestampMs:end,timing:{boundary:{'5m':{secondsToBoundary:5,secondsSinceBoundary:295,atBoundary:false},'15m':{secondsToBoundary:605,secondsSinceBoundary:295,atBoundary:false},'60m':{secondsToBoundary:3305,secondsSinceBoundary:295,atBoundary:false}}},price:{closeMid:100,micropriceMinusMidLast:.1},orderFlow:{ofiNormalizedByMeanDepth:.2,depthImbalanceLast:.3},trades:{signedNotionalSum:100},semantics:{derivedFromTrustedL2Only:true}};
const d5=path.join(root,'derived','kraken','windows','BTCUSD','5s','2026','08','22'),d1=path.join(root,'derived','kraken','windows','BTCUSD','1s','2026','08','22');fs.mkdirSync(d5,{recursive:true});fs.mkdirSync(d1,{recursive:true});fs.writeFileSync(path.join(d5,'00.ndjson'),JSON.stringify(window)+'\n');
const future=[5,15,30,60].map((h,i)=>({windowId:`f${h}`,symbol:'BTC/USD',windowSec:1,endTimestampMs:end+h*1000,price:{closeMid:[101,99,102,100.5][i]},semantics:{derivedFromTrustedL2Only:true}}));fs.writeFileSync(path.join(d1,'00.ndjson'),future.map(JSON.stringify).join('\n')+'\n');
const state={schemaVersion:'short-horizon-prospective-worker-state-v2',files5:{},files1:{},pending:{},recent1s:{},adaptiveState:createAdaptiveState(),adaptiveLearned:{},counts:{eligibleSignals:0,signalsWritten:0,outcomesWritten:0,postMortemsWritten:0,adaptiveUpdates:0,blindOutcomesRetired:0,adaptiveLearningSkippedBlind:0,duplicatesSkipped:0,parseErrors:0,expiredPending:0}};
processProspectiveOnce(root,state,end+65_000);assert.equal(state.counts.signalsWritten,3);assert.equal(state.counts.outcomesWritten,12);assert.equal(state.counts.blindOutcomesRetired,12);assert.equal(state.counts.adaptiveUpdates,0);assert.equal(state.counts.adaptiveLearningSkippedBlind,1);assert.equal(state.adaptiveState.stateVersion,0);
console.log('v0.58 blind epoch tests PASS');
