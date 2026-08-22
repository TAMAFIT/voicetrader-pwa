import assert from 'node:assert/strict';
import {createCrossVenueLearningScorecardState,updateCrossVenueLearningScorecard,buildCrossVenueLearningScorecard} from '../src/short-horizon/cross-venue-learning-scorecard.js';
import {CROSS_VENUE_FROZEN_SPEC_FINGERPRINT} from '../src/short-horizon/cross-venue-preregistered-hypothesis.js';

const obs=(id,{instrument='BTCUSD',role='BOUNDARY_PRIMARY',partition='LEARNING_STREAM',eligible=true,directionalPair=true,decisionAgreement=true,directionalAgreement=true,featureRate=0.75,directionalFeatureRate=0.75,sealed=false}={})=>({schemaVersion:'voicetrader-cross-venue-preregistered-observation-v1',observationId:id,specFingerprint:CROSS_VENUE_FROZEN_SPEC_FINGERPRINT,canonicalInstrument:instrument,sampleRole:role,evaluationPartition:{role:partition},eligible,venueDecisions:sealed?null:{kraken:{decision:'LONG'},coinbase:{decision:decisionAgreement?'LONG':'SHORT'}},replication:sealed?null:{directionalPair,decisionAgreement,directionalAgreement:directionalPair?directionalAgreement:null,featureSignAgreementRate:featureRate,directionalFeatureSignAgreementRate:directionalFeatureRate}});

const state=createCrossVenueLearningScorecardState();
updateCrossVenueLearningScorecard(state,obs('b1'));
updateCrossVenueLearningScorecard(state,obs('b2',{decisionAgreement:false,directionalAgreement:false,featureRate:0.5,directionalFeatureRate:0.5}));
updateCrossVenueLearningScorecard(state,obs('b3',{directionalPair:false,decisionAgreement:false,directionalAgreement:null,featureRate:0.75,directionalFeatureRate:0.75}));
updateCrossVenueLearningScorecard(state,obs('p1',{role:'PHASE_CONTROL',decisionAgreement:true,directionalAgreement:true,featureRate:0.5,directionalFeatureRate:0.5}));
updateCrossVenueLearningScorecard(state,obs('p2',{role:'PHASE_CONTROL',decisionAgreement:false,directionalAgreement:false,featureRate:0.25,directionalFeatureRate:0.25}));
updateCrossVenueLearningScorecard(state,obs('blind1',{partition:'BLIND_EXAM',sealed:true}));
updateCrossVenueLearningScorecard(state,obs('out1',{role:'OUT_OF_SCOPE'}));
updateCrossVenueLearningScorecard(state,obs('ineligible1',{eligible:false}));
updateCrossVenueLearningScorecard(state,obs('b1'));

assert.equal(state.counts.learningProcessed,5);
assert.equal(state.counts.blindSkippedSealed,1);
assert.equal(state.counts.outOfScopeSkipped,1);
assert.equal(state.counts.ineligibleSkipped,1);
assert.equal(state.counts.duplicatesSkipped,1);
const score=buildCrossVenueLearningScorecard(state,{generatedAtMs:12345});
assert.equal(score.generatedAtMs,12345);
assert.equal(score.governance.learningStreamOnly,true);
assert.equal(score.governance.blindResultsConsumed,false);
assert.equal(score.governance.blindResultsExposed,false);
assert.equal(score.governance.predictionInputAuthorized,false);
const boundary=score.groups.find((g)=>g.canonicalInstrument==='BTCUSD'&&g.sampleRole==='BOUNDARY_PRIMARY');
const phase=score.groups.find((g)=>g.canonicalInstrument==='BTCUSD'&&g.sampleRole==='PHASE_CONTROL');
assert.equal(boundary.eligible,3);assert.equal(boundary.directionalPairs,2);assert.equal(boundary.decisionAgreementRate,0.333333);assert.equal(boundary.directionalDecisionAgreementRate,0.5);assert.equal(boundary.directionalPairRate,0.666667);assert.equal(boundary.meanFeatureSignAgreementRate,0.666667);
assert.equal(phase.eligible,2);assert.equal(phase.directionalDecisionAgreementRate,0.5);assert.equal(phase.decisionAgreementRate,0.5);
const comparison=score.comparisons.find((x)=>x.canonicalInstrument==='BTCUSD');assert.equal(comparison.status,'DESCRIPTIVE_AVAILABLE');assert.equal(comparison.directionalAgreementDeltaBoundaryMinusPhase,0);assert.equal(comparison.decisionAgreementDeltaBoundaryMinusPhase,-0.166667);

const nullState=createCrossVenueLearningScorecardState();updateCrossVenueLearningScorecard(nullState,obs('null1',{featureRate:null,directionalFeatureRate:null}));const nullScore=buildCrossVenueLearningScorecard(nullState);const nullGroup=nullScore.groups[0];assert.equal(nullGroup.meanFeatureSignAgreementRate,null);assert.equal(nullGroup.meanDirectionalFeatureSignAgreementRate,null);assert.equal(nullScore.comparisons[0].featureSignAgreementDeltaBoundaryMinusPhase,null);
assert.throws(()=>updateCrossVenueLearningScorecard(createCrossVenueLearningScorecardState(),obs('blind-leak',{partition:'BLIND_EXAM',sealed:false})),/cross-venue-blind-result-leak/);
console.log('PASS v0.80 learning-only cross-venue scorecard');
