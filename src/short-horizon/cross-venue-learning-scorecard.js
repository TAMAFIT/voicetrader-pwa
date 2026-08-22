import {CROSS_VENUE_HYPOTHESIS_SCHEMA,CROSS_VENUE_FROZEN_SPEC_FINGERPRINT} from './cross-venue-preregistered-hypothesis.js';

export const CROSS_VENUE_LEARNING_SCORECARD_STATE_SCHEMA='voicetrader-cross-venue-learning-scorecard-state-v1';
export const CROSS_VENUE_LEARNING_SCORECARD_SCHEMA='voicetrader-cross-venue-learning-scorecard-v1';
const round=(v,d=8)=>{const n=Number(v);if(!Number.isFinite(n))return null;const s=10**d;return Math.round(n*s)/s;};
const presentNumber=(v)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
function makeGroup(o){return {canonicalInstrument:o.canonicalInstrument,sampleRole:o.sampleRole,total:0,eligible:0,directionalPairs:0,decisionAgreements:0,directionalAgreements:0,featureRateCount:0,featureRateSum:0,directionalFeatureRateCount:0,directionalFeatureRateSum:0};}
function groupKey(o){return `${o.canonicalInstrument}|${o.sampleRole}`;}
export function createCrossVenueLearningScorecardState(){return {schemaVersion:CROSS_VENUE_LEARNING_SCORECARD_STATE_SCHEMA,specFingerprint:CROSS_VENUE_FROZEN_SPEC_FINGERPRINT,processedObservationIds:{},groups:{},counts:{observationsSeen:0,learningProcessed:0,blindSkippedSealed:0,outOfScopeSkipped:0,ineligibleSkipped:0,duplicatesSkipped:0,invalidSkipped:0}};}
export function updateCrossVenueLearningScorecard(state,observation){
  if(state?.schemaVersion!==CROSS_VENUE_LEARNING_SCORECARD_STATE_SCHEMA||state.specFingerprint!==CROSS_VENUE_FROZEN_SPEC_FINGERPRINT)throw new Error('cross-venue-scorecard-state-invalid');
  state.counts.observationsSeen+=1;
  if(observation?.schemaVersion!==CROSS_VENUE_HYPOTHESIS_SCHEMA||!observation?.observationId){state.counts.invalidSkipped+=1;return state;}
  if(state.processedObservationIds[observation.observationId]){state.counts.duplicatesSkipped+=1;return state;}
  state.processedObservationIds[observation.observationId]=true;
  if(observation?.evaluationPartition?.role==='BLIND_EXAM'){if(observation?.venueDecisions!=null||observation?.replication!=null)throw new Error('cross-venue-blind-result-leak');state.counts.blindSkippedSealed+=1;return state;}
  if(observation?.evaluationPartition?.role!=='LEARNING_STREAM'){state.counts.invalidSkipped+=1;return state;}
  if(observation.sampleRole==='OUT_OF_SCOPE'){state.counts.outOfScopeSkipped+=1;return state;}
  if(!['BOUNDARY_PRIMARY','PHASE_CONTROL'].includes(observation.sampleRole)){state.counts.invalidSkipped+=1;return state;}
  const key=groupKey(observation);if(!state.groups[key])state.groups[key]=makeGroup(observation);const g=state.groups[key];g.total+=1;
  if(observation.eligible!==true){state.counts.ineligibleSkipped+=1;return state;}
  if(!observation.replication||!observation.venueDecisions)throw new Error('cross-venue-learning-result-missing');
  g.eligible+=1;state.counts.learningProcessed+=1;if(observation.replication.directionalPair===true)g.directionalPairs+=1;if(observation.replication.decisionAgreement===true)g.decisionAgreements+=1;if(observation.replication.directionalAgreement===true)g.directionalAgreements+=1;
  const f=observation.replication.featureSignAgreementRate;if(presentNumber(f)){g.featureRateCount+=1;g.featureRateSum+=Number(f);}const df=observation.replication.directionalFeatureSignAgreementRate;if(presentNumber(df)){g.directionalFeatureRateCount+=1;g.directionalFeatureRateSum+=Number(df);}return state;
}
function summarizeGroup(g){return {canonicalInstrument:g.canonicalInstrument,sampleRole:g.sampleRole,total:g.total,eligible:g.eligible,directionalPairs:g.directionalPairs,decisionAgreementRate:g.eligible?round(g.decisionAgreements/g.eligible,6):null,directionalPairRate:g.eligible?round(g.directionalPairs/g.eligible,6):null,directionalDecisionAgreementRate:g.directionalPairs?round(g.directionalAgreements/g.directionalPairs,6):null,meanFeatureSignAgreementRate:g.featureRateCount?round(g.featureRateSum/g.featureRateCount,6):null,meanDirectionalFeatureSignAgreementRate:g.directionalFeatureRateCount?round(g.directionalFeatureRateSum/g.directionalFeatureRateCount,6):null};}
function diff(a,b){return presentNumber(a)&&presentNumber(b)?round(Number(a)-Number(b),6):null;}
export function buildCrossVenueLearningScorecard(state,{generatedAtMs=Date.now()}={}){
  if(state?.schemaVersion!==CROSS_VENUE_LEARNING_SCORECARD_STATE_SCHEMA)throw new Error('cross-venue-scorecard-state-invalid');const groups=Object.values(state.groups).map(summarizeGroup).sort((a,b)=>a.canonicalInstrument.localeCompare(b.canonicalInstrument)||a.sampleRole.localeCompare(b.sampleRole)),comparisons=[];
  for(const instrument of ['BTCUSD','ETHUSD']){const primary=groups.find((g)=>g.canonicalInstrument===instrument&&g.sampleRole==='BOUNDARY_PRIMARY')||null,control=groups.find((g)=>g.canonicalInstrument===instrument&&g.sampleRole==='PHASE_CONTROL')||null;comparisons.push({canonicalInstrument:instrument,boundaryEligible:primary?.eligible??0,phaseControlEligible:control?.eligible??0,directionalAgreementDeltaBoundaryMinusPhase:diff(primary?.directionalDecisionAgreementRate,control?.directionalDecisionAgreementRate),decisionAgreementDeltaBoundaryMinusPhase:diff(primary?.decisionAgreementRate,control?.decisionAgreementRate),featureSignAgreementDeltaBoundaryMinusPhase:diff(primary?.meanFeatureSignAgreementRate,control?.meanFeatureSignAgreementRate),directionalPairRateDeltaBoundaryMinusPhase:diff(primary?.directionalPairRate,control?.directionalPairRate),status:primary&&control?'DESCRIPTIVE_AVAILABLE':'INSUFFICIENT_GROUPS'});}
  return {schemaVersion:CROSS_VENUE_LEARNING_SCORECARD_SCHEMA,specFingerprint:state.specFingerprint,generatedAtMs:Number(generatedAtMs),groups,comparisons,coverage:{...state.counts},governance:{learningStreamOnly:true,blindResultsConsumed:false,blindResultsExposed:false,descriptiveOnly:true,noIidSignificanceClaim:true,noPredictivePerformanceClaim:true,noProfitabilityClaim:true,predictionInputAuthorized:false,adaptiveLearningAuthorized:false,automaticPromotion:false,executionAuthorized:false,actualNetEvAvailable:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}};
}
