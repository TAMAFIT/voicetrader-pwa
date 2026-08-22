import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProspectiveSignals,matureProspectiveOutcome } from '../src/short-horizon/short-horizon-prospective-experiment.js';
import { createAdaptiveState } from '../src/short-horizon/adaptive-experiment.js';
import { processProspectiveOnce } from './local-node/short-horizon-prospective-worker.mjs';

const end=Date.parse('2026-08-22T00:04:55Z');
const boundaryWindow={windowId:'w1',symbol:'BTC/USD',windowSec:5,endTimestampMs:end,timing:{boundary:{'5m':{secondsToBoundary:5,secondsSinceBoundary:295,atBoundary:false},'15m':{secondsToBoundary:605,secondsSinceBoundary:295,atBoundary:false},'60m':{secondsToBoundary:3305,secondsSinceBoundary:295,atBoundary:false}}},price:{closeMid:100,micropriceMinusMidLast:.1},orderFlow:{ofiNormalizedByMeanDepth:.2,depthImbalanceLast:.3},trades:{signedNotionalSum:100},semantics:{derivedFromTrustedL2Only:true}};
const signals=buildProspectiveSignals(boundaryWindow,{generatedAtMs:end});assert.equal(signals.length,3);assert.equal(signals[0].decision,'LONG');assert.equal(signals[0].sampleRole,'PRIMARY');assert.equal(signals[1].sampleRole,'NULL');assert.equal(signals[2].boundary.eligible,false);
const future={windowId:'f1',symbol:'BTC/USD',windowSec:1,endTimestampMs:end+5000,targetHorizonSec:5,price:{closeMid:101},semantics:{derivedFromTrustedL2Only:true}};const outcome=matureProspectiveOutcome(signals[0],future,{maturedAtMs:end+6000});assert.equal(outcome.result,'WIN');assert.equal(outcome.directionalReturnBps,100);assert.equal(outcome.governance.actualNetEvAvailable,false);

const root=fs.mkdtempSync(path.join(os.tmpdir(),'vt-v055-live-'));const dir5=path.join(root,'derived','kraken','windows','BTCUSD','5s','2026','08','22'),dir1=path.join(root,'derived','kraken','windows','BTCUSD','1s','2026','08','22');fs.mkdirSync(dir5,{recursive:true});fs.mkdirSync(dir1,{recursive:true});fs.writeFileSync(path.join(dir5,'00.ndjson'),JSON.stringify(boundaryWindow)+'\n','utf8');
const state={schemaVersion:'short-horizon-prospective-worker-state-v3',files5:{},files1:{},pending:{},recent1s:{},adaptiveState:createAdaptiveState(),adaptiveLearned:{},counts:{eligibleSignals:0,signalsWritten:0,outcomesWritten:0,postMortemsWritten:0,adaptiveUpdates:0,blindOutcomesRetired:0,adaptiveLearningSkippedBlind:0,staleSignalWindowsSkipped:0,duplicatesSkipped:0,parseErrors:0,expiredPending:0}};
processProspectiveOnce(root,state,end+1000);assert.equal(state.counts.signalsWritten,3);assert.equal(state.counts.outcomesWritten,0);
const futureRows=[5,15,30,60].map((h,i)=>({windowId:`w1-${h}`,symbol:'BTC/USD',windowSec:1,endTimestampMs:end+h*1000,price:{closeMid:[101,99,102,100.5][i]},semantics:{derivedFromTrustedL2Only:true}}));fs.writeFileSync(path.join(dir1,'00.ndjson'),futureRows.map(JSON.stringify).join('\n')+'\n','utf8');processProspectiveOnce(root,state,end+65_000);assert.equal(state.counts.outcomesWritten,12);assert.equal(state.counts.parseErrors,0);

const staleRoot=fs.mkdtempSync(path.join(os.tmpdir(),'vt-v055-stale-'));const stale5=path.join(staleRoot,'derived','kraken','windows','BTCUSD','5s','2026','08','22');fs.mkdirSync(stale5,{recursive:true});fs.writeFileSync(path.join(stale5,'00.ndjson'),JSON.stringify({...boundaryWindow,windowId:'stale'})+'\n');const staleState={schemaVersion:'short-horizon-prospective-worker-state-v3',files5:{},files1:{},pending:{},recent1s:{},adaptiveState:createAdaptiveState(),adaptiveLearned:{},counts:{eligibleSignals:0,signalsWritten:0,outcomesWritten:0,postMortemsWritten:0,adaptiveUpdates:0,blindOutcomesRetired:0,adaptiveLearningSkippedBlind:0,staleSignalWindowsSkipped:0,duplicatesSkipped:0,parseErrors:0,expiredPending:0}};processProspectiveOnce(staleRoot,staleState,end+60_000);assert.equal(staleState.counts.signalsWritten,0);assert.equal(staleState.counts.staleSignalWindowsSkipped,1);
console.log('v0.60 strict prospective experiment tests PASS');
