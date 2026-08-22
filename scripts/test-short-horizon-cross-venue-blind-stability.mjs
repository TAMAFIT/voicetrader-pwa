import assert from 'node:assert/strict';
import {buildCrossVenueBlindStability} from '../src/short-horizon/cross-venue-blind-stability.js';

const base=Date.UTC(2026,7,22,9,0,0);
const rows=[];
for(const instrument of ['BTCUSD','ETHUSD']){
  for(let i=0;i<100;i++)rows.push({observationId:`${instrument}-b-${i}`,canonicalInstrument:instrument,sampleRole:'BOUNDARY_PRIMARY',startTimestampMs:base+i*5000,replication:{directionalPair:true,directionalAgreement:true}});
  for(let i=0;i<100;i++)rows.push({observationId:`${instrument}-p-${i}`,canonicalInstrument:instrument,sampleRole:'PHASE_CONTROL',startTimestampMs:base+i*5000,replication:{directionalPair:true,directionalAgreement:i%4===0}});
}
const reveal={schemaVersion:'voicetrader-cross-venue-blind-reveal-v1',manifestId:'manifest-1',revealId:'reveal-1',revealedObservations:rows,governance:{allSelectedRetired:true,noTopUpAfterReveal:true}};
const stability=buildCrossVenueBlindStability(reveal,{generatedAtMs:123});assert.equal(stability.generatedAtMs,123);assert.equal(stability.instruments.length,2);assert.equal(stability.crossInstrumentStatus,'POSITIVE_SAME_SIGN');for(const x of stability.instruments){assert.equal(x.boundary.directionalPairs,100);assert.equal(x.boundary.rate,1);assert.equal(x.phaseControl.directionalPairs,100);assert.equal(x.phaseControl.rate,0.25);assert.equal(x.overallDirectionalAgreementDeltaBoundaryMinusPhase,0.75);assert.equal(x.temporalBlocks.length,4);assert.equal(x.positiveBlocks,4);assert.equal(x.temporalStatus,'POSITIVE_CONSISTENT');for(const block of x.temporalBlocks)assert.ok(block.directionalAgreementDeltaBoundaryMinusPhase>0);}assert.equal(stability.governance.descriptiveOnly,true);assert.equal(stability.governance.noIidSignificanceClaim,true);assert.equal(stability.governance.adaptiveLearningAuthorized,false);assert.equal(stability.governance.predictionInputAuthorized,false);assert.equal(stability.governance.actualNetEvAvailable,false);
const mixed=structuredClone(reveal);for(const o of mixed.revealedObservations)if(o.canonicalInstrument==='ETHUSD'){if(o.sampleRole==='BOUNDARY_PRIMARY')o.replication.directionalAgreement=false;else o.replication.directionalAgreement=true;}const mixedScore=buildCrossVenueBlindStability(mixed);assert.equal(mixedScore.crossInstrumentStatus,'MIXED_SIGN');const eth=mixedScore.instruments.find((x)=>x.canonicalInstrument==='ETHUSD');assert.equal(eth.temporalStatus,'NEGATIVE_CONSISTENT');
assert.throws(()=>buildCrossVenueBlindStability({...reveal,governance:{allSelectedRetired:false,noTopUpAfterReveal:true}}),/reveal-invalid/);
console.log('PASS v0.83 Blind temporal + cross-instrument stability');
