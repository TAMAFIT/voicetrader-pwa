import assert from 'node:assert/strict';
import {CROSS_VENUE_FROZEN_SPEC,CROSS_VENUE_FROZEN_SPEC_FINGERPRINT,buildPreregisteredCrossVenueObservation,publicCrossVenueObservation} from '../src/short-horizon/cross-venue-preregistered-hypothesis.js';

const base=Date.UTC(2026,7,22,5,0,0);
const boundary=(since5=0,to5=0)=>[
  {name:'5m',atBoundary:since5===0&&to5===0,secondsSinceBoundary:since5,secondsToBoundary:to5},
  {name:'15m',atBoundary:false,secondsSinceBoundary:300,secondsToBoundary:600},
  {name:'60m',atBoundary:false,secondsSinceBoundary:300,secondsToBoundary:3300},
];
const metrics=[
  {name:'OFI_NORMALIZED',available:true,krakenSign:1,coinbaseSign:1,signAgreement:true,bothDirectional:true},
  {name:'DEPTH_IMBALANCE',available:true,krakenSign:1,coinbaseSign:1,signAgreement:true,bothDirectional:true},
  {name:'MICROPRICE_DELTA',available:true,krakenSign:1,coinbaseSign:-1,signAgreement:false,bothDirectional:true},
  {name:'TAKER_FLOW',available:true,krakenSign:-1,coinbaseSign:1,signAgreement:false,bothDirectional:true},
];
const pair=(start,{b=boundary(),eligible=true}={})=>({schemaVersion:'voicetrader-cross-venue-replication-v1',pairId:`pair-${start}`,canonicalInstrument:'BTCUSD',windowSec:5,startTimestampMs:start,endTimestampMs:start+5000,eligibility:{descriptiveEligible:eligible,boundaryAligned:true},boundary:{kraken:b,coinbase:b},metrics,replication:{signAgreementRate:0.5,directionalSignAgreementRate:0.5}});

assert.equal(Object.isFrozen(CROSS_VENUE_FROZEN_SPEC),true);
assert.equal(CROSS_VENUE_FROZEN_SPEC.perVenueMinVotes,3);
assert.deepEqual(CROSS_VENUE_FROZEN_SPEC.phaseControlOffsetsSec,[140,145,150,155]);
assert.equal(CROSS_VENUE_FROZEN_SPEC_FINGERPRINT.length,64);

const primary=buildPreregisteredCrossVenueObservation(pair(base),{generatedAtMs:base+6000});
assert.equal(primary.sampleRole,'BOUNDARY_PRIMARY');
assert.equal(primary.matchedBoundary,'5m');
assert.equal(primary.eligible,true);
assert.equal(primary.venueDecisions.kraken.decision,'LONG');
assert.equal(primary.venueDecisions.coinbase.decision,'LONG');
assert.equal(primary.replication.directionalPair,true);
assert.equal(primary.replication.decisionAgreement,true);
assert.equal(primary.replication.directionalAgreement,true);
assert.equal(primary.governance.frozenSpec,true);
assert.equal(primary.governance.preregisteredBeforeCrossVenuePredictiveOutcomeEvaluation,true);
assert.equal(primary.governance.predictionInputAuthorized,false);
assert.equal(primary.governance.adaptiveLearningAuthorized,false);
assert.equal(primary.governance.actualNetEvAvailable,false);
assert.equal(primary.specFingerprint,CROSS_VENUE_FROZEN_SPEC_FINGERPRINT);

const phasePair=pair(base+140_000,{b:boundary(140,160)});const phase=buildPreregisteredCrossVenueObservation(phasePair,{generatedAtMs:phasePair.endTimestampMs+1});assert.equal(phase.sampleRole,'PHASE_CONTROL');assert.equal(phase.eligible,true);
const outPair=pair(base+60_000,{b:boundary(60,240)});const out=buildPreregisteredCrossVenueObservation(outPair,{generatedAtMs:outPair.endTimestampMs+1});assert.equal(out.sampleRole,'OUT_OF_SCOPE');assert.equal(out.eligible,false);
const sourceBad=pair(base+300_000,{eligible:false});const sourceBadObs=buildPreregisteredCrossVenueObservation(sourceBad,{generatedAtMs:sourceBad.endTimestampMs+1});assert.equal(sourceBadObs.eligible,false);
assert.throws(()=>buildPreregisteredCrossVenueObservation({...pair(base),canonicalInstrument:'DOGEUSD'}),/cross-venue-preregistered-scope-invalid/);
assert.throws(()=>buildPreregisteredCrossVenueObservation(pair(base),{generatedAtMs:base}),/cross-venue-preregistered-before-window-close/);

let blind=null,learning=null;
for(let i=0;i<100&&(blind==null||learning==null);i++){
  const p=pair(base+i*5000);p.pairId=`pair-partition-${i}`;const o=buildPreregisteredCrossVenueObservation(p,{generatedAtMs:p.endTimestampMs+1});if(o.evaluationPartition.role==='BLIND_EXAM')blind??=o;else learning??=o;
}
assert.ok(blind);assert.ok(learning);
const sealed=publicCrossVenueObservation(blind);assert.equal(sealed.venueDecisions,null);assert.equal(sealed.replication,null);assert.equal(sealed.blindState.status,'SEALED');assert.equal(sealed.blindState.resultExposed,false);assert.equal(sealed.governance.blindResultSealed,true);
const revealed=publicCrossVenueObservation(blind,{revealBlind:true});assert.ok(revealed.venueDecisions);assert.ok(revealed.replication);
const publicLearning=publicCrossVenueObservation(learning);assert.ok(publicLearning.venueDecisions);assert.ok(publicLearning.replication);

console.log('PASS v0.79 preregistered cross-venue hypothesis + blind sealing');
