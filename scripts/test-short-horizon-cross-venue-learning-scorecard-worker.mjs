import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createCrossVenueLearningScorecardState} from '../src/short-horizon/cross-venue-learning-scorecard.js';
import {CROSS_VENUE_FROZEN_SPEC_FINGERPRINT} from '../src/short-horizon/cross-venue-preregistered-hypothesis.js';
import {processOnce,scorecardSnapshot} from './local-node/cross-venue-learning-scorecard-worker.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'voicetrader-v080-learning-worker-'));
const learningDir=path.join(root,'derived','cross-venue','preregistered','learning','BTCUSD','5s','2026','08','22');
const blindDir=path.join(root,'derived','cross-venue','preregistered','blind-sealed','BTCUSD','5s','2026','08','22');fs.mkdirSync(learningDir,{recursive:true});fs.mkdirSync(blindDir,{recursive:true});
const full={schemaVersion:'voicetrader-cross-venue-preregistered-observation-v1',observationId:'learning-1',specFingerprint:CROSS_VENUE_FROZEN_SPEC_FINGERPRINT,canonicalInstrument:'BTCUSD',sampleRole:'BOUNDARY_PRIMARY',evaluationPartition:{role:'LEARNING_STREAM'},eligible:true,venueDecisions:{kraken:{decision:'LONG'},coinbase:{decision:'LONG'}},replication:{directionalPair:true,decisionAgreement:true,directionalAgreement:true,featureSignAgreementRate:0.75,directionalFeatureSignAgreementRate:0.75}};
const sealed={schemaVersion:'voicetrader-cross-venue-preregistered-observation-v1',observationId:'blind-1',specFingerprint:CROSS_VENUE_FROZEN_SPEC_FINGERPRINT,canonicalInstrument:'BTCUSD',sampleRole:'BOUNDARY_PRIMARY',evaluationPartition:{role:'BLIND_EXAM'},eligible:true,venueDecisions:null,replication:null,blindState:{status:'SEALED',resultExposed:false}};
fs.writeFileSync(path.join(learningDir,'06.ndjson'),JSON.stringify(full)+'\n');fs.writeFileSync(path.join(blindDir,'06.ndjson'),JSON.stringify(sealed)+'\n');
const state={schemaVersion:'voicetrader-cross-venue-learning-scorecard-worker-state-v1',files:{},scoreState:createCrossVenueLearningScorecardState(),counts:{linesRead:0,parseErrors:0}};
processOnce(root,state,12345);assert.equal(state.counts.linesRead,1);assert.equal(state.counts.parseErrors,0);assert.equal(state.scoreState.counts.learningProcessed,1);assert.equal(state.scoreState.counts.blindSkippedSealed,0);assert.equal(state.governance.sourceScope,'LEARNING_DIRECTORY_ONLY');assert.equal(state.governance.blindDirectoryRead,false);assert.equal(state.governance.blindResultsConsumed,false);
const score=scorecardSnapshot(state,{generatedAtMs:23456});assert.equal(score.generatedAtMs,23456);assert.equal(score.groups.length,1);assert.equal(score.groups[0].eligible,1);assert.equal(score.groups[0].directionalDecisionAgreementRate,1);assert.equal(score.governance.blindResultsConsumed,false);assert.equal(score.worker.blindDirectoryRead,false);
processOnce(root,state,34567);assert.equal(state.counts.linesRead,1);assert.equal(state.scoreState.counts.learningProcessed,1);
console.log('PASS v0.80 learning-directory-only scorecard worker');
