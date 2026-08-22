import crypto from 'node:crypto';
import {assignEvaluationPartition} from './blind-epoch.js';
import {CROSS_VENUE_REPLICATION_SCHEMA} from './cross-venue-replication.js';

export const CROSS_VENUE_HYPOTHESIS_SCHEMA='voicetrader-cross-venue-preregistered-observation-v1';
export const CROSS_VENUE_FROZEN_SPEC=Object.freeze({
  hypothesisId:'CROSS_VENUE_BOUNDARY_SIGNAL_REPLICATION_V1',
  version:1,
  inputWindowSec:5,
  instruments:Object.freeze(['BTCUSD','ETHUSD']),
  featureFamilies:Object.freeze(['OFI_NORMALIZED','DEPTH_IMBALANCE','MICROPRICE_DELTA','TAKER_FLOW']),
  perVenueMinVotes:3,
  boundaryBeforeSec:10,
  boundaryAfterSec:5,
  phaseControlOffsetsSec:Object.freeze([140,145,150,155]),
  primaryComparison:'BOUNDARY_MINUS_PHASE_CONTROL_DIRECTIONAL_DECISION_AGREEMENT',
  secondaryMetrics:Object.freeze(['ALL_DECISION_AGREEMENT','DIRECTIONAL_PAIR_RATE','FEATURE_SIGN_AGREEMENT']),
  blindExamFraction:0.2,
  minimumBlindDirectionalPairs:200,
  description:'Preregistered same-clock Kraken/Coinbase replication of the frozen 3-of-4 microstructure decision rule at clock boundaries versus fixed interior phase controls.',
});
export const CROSS_VENUE_FROZEN_SPEC_FINGERPRINT=crypto.createHash('sha256').update(JSON.stringify(CROSS_VENUE_FROZEN_SPEC)).digest('hex');

function metricVote(pair,name,venue){const m=(pair?.metrics||[]).find((x)=>x?.name===name);const v=venue==='KRAKEN'?m?.krakenSign:m?.coinbaseSign;return Number.isInteger(v)&&[-1,0,1].includes(v)?v:0;}
function venueDecision(pair,venue){const votes=CROSS_VENUE_FROZEN_SPEC.featureFamilies.map((name)=>({name,value:metricVote(pair,name,venue)})),nonzero=votes.filter((v)=>v.value!==0),buy=nonzero.filter((v)=>v.value>0).length,sell=nonzero.filter((v)=>v.value<0).length;let decision='WAIT';if(buy>=CROSS_VENUE_FROZEN_SPEC.perVenueMinVotes&&buy>sell)decision='LONG';else if(sell>=CROSS_VENUE_FROZEN_SPEC.perVenueMinVotes&&sell>buy)decision='SHORT';return {decision,votes,buyVotes:buy,sellVotes:sell,nonzeroVotes:nonzero.length};}
function boundaryRole(pair){const b=pair?.boundary?.kraken||[];const byName=Object.fromEntries(b.map((x)=>[x.name,x]));for(const name of ['5m','15m','60m']){const x=byName[name];if(!x)continue;const before=Number(x.secondsToBoundary),after=Number(x.secondsSinceBoundary);if(x.atBoundary===true||(Number.isFinite(before)&&before>0&&before<=CROSS_VENUE_FROZEN_SPEC.boundaryBeforeSec)||(Number.isFinite(after)&&after>0&&after<=CROSS_VENUE_FROZEN_SPEC.boundaryAfterSec))return {role:'BOUNDARY_PRIMARY',matchedBoundary:name};}const since5=Number(byName?.['5m']?.secondsSinceBoundary);if(CROSS_VENUE_FROZEN_SPEC.phaseControlOffsetsSec.includes(since5))return {role:'PHASE_CONTROL',matchedBoundary:'5m-phase-control'};return {role:'OUT_OF_SCOPE',matchedBoundary:null};}
function deterministicPartitionId(pair){return ['cross-venue-replication-v1',pair.canonicalInstrument,pair.windowSec,pair.startTimestampMs].join('|');}

export function buildPreregisteredCrossVenueObservation(pair,{generatedAtMs=Date.now()}={}){
  if(pair?.schemaVersion!==CROSS_VENUE_REPLICATION_SCHEMA)throw new Error('cross-venue-preregistered-pair-invalid');
  if(Number(pair.windowSec)!==CROSS_VENUE_FROZEN_SPEC.inputWindowSec||!CROSS_VENUE_FROZEN_SPEC.instruments.includes(pair.canonicalInstrument))throw new Error('cross-venue-preregistered-scope-invalid');
  if(Number(generatedAtMs)<Number(pair.endTimestampMs))throw new Error('cross-venue-preregistered-before-window-close');
  const role=boundaryRole(pair),partition=assignEvaluationPartition(deterministicPartitionId(pair)),kraken=venueDecision(pair,'KRAKEN'),coinbase=venueDecision(pair,'COINBASE'),directionalPair=['LONG','SHORT'].includes(kraken.decision)&&['LONG','SHORT'].includes(coinbase.decision),decisionAgreement=kraken.decision===coinbase.decision,directionalAgreement=directionalPair?decisionAgreement:null;
  const eligible=pair?.eligibility?.descriptiveEligible===true&&pair?.eligibility?.boundaryAligned===true&&role.role!=='OUT_OF_SCOPE';
  const observationId=crypto.createHash('sha256').update([CROSS_VENUE_FROZEN_SPEC.hypothesisId,pair.pairId].join('|')).digest('hex');
  return {schemaVersion:CROSS_VENUE_HYPOTHESIS_SCHEMA,observationId,hypothesisId:CROSS_VENUE_FROZEN_SPEC.hypothesisId,specFingerprint:CROSS_VENUE_FROZEN_SPEC_FINGERPRINT,pairId:pair.pairId,canonicalInstrument:pair.canonicalInstrument,windowSec:pair.windowSec,startTimestampMs:pair.startTimestampMs,endTimestampMs:pair.endTimestampMs,generatedAtMs:Number(generatedAtMs),sampleRole:role.role,matchedBoundary:role.matchedBoundary,evaluationPartition:partition,eligible,venueDecisions:{kraken,coinbase},replication:{directionalPair,decisionAgreement,directionalAgreement,featureSignAgreementRate:pair.replication?.signAgreementRate??null,directionalFeatureSignAgreementRate:pair.replication?.directionalSignAgreementRate??null},sourceEligibility:pair.eligibility,governance:{frozenSpec:true,preregisteredBeforeCrossVenuePredictiveOutcomeEvaluation:true,partitionAssignedIndependentOfFeatureValues:true,usesFutureOutcome:false,crossVenuePairIsContemporaneousObservation:true,descriptiveReplicationOnly:true,predictiveReplicationClaim:false,predictionInputAuthorized:false,adaptiveLearningAuthorized:false,automaticPromotion:false,executionAuthorized:false,realMoneyRouting:false,orderSubmission:false,actualNetEvAvailable:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}};
}

export function publicCrossVenueObservation(observation,{revealBlind=false}={}){
  if(observation?.schemaVersion!==CROSS_VENUE_HYPOTHESIS_SCHEMA)throw new Error('cross-venue-observation-invalid');
  if(observation.evaluationPartition?.role!=='BLIND_EXAM'||revealBlind===true)return observation;
  return {...observation,venueDecisions:null,replication:null,blindState:{status:'SEALED',resultExposed:false,eligibleForLearning:false},governance:{...observation.governance,blindResultSealed:true}};
}
