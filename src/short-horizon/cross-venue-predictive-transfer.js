import crypto from 'node:crypto';
import {CROSS_VENUE_HYPOTHESIS_SCHEMA,CROSS_VENUE_FROZEN_SPEC_FINGERPRINT} from './cross-venue-preregistered-hypothesis.js';

export const CROSS_VENUE_PREDICTIVE_SIGNAL_SCHEMA='voicetrader-cross-venue-predictive-signal-v1';
export const CROSS_VENUE_PREDICTIVE_OUTCOME_SCHEMA='voicetrader-cross-venue-predictive-outcome-v1';
export const CROSS_VENUE_PREDICTIVE_SPEC=Object.freeze({
  hypothesisId:'CROSS_VENUE_PREDICTIVE_TRANSFER_V1',
  sourceHypothesisId:'CROSS_VENUE_BOUNDARY_SIGNAL_REPLICATION_V1',
  sourceSpecFingerprint:CROSS_VENUE_FROZEN_SPEC_FINGERPRINT,
  inputWindowSec:5,
  exitWindowSec:1,
  horizonsSec:Object.freeze([5,15,30,60]),
  maxExitDelayMs:2500,
  routes:Object.freeze(['KRAKEN_ON_KRAKEN','COINBASE_ON_COINBASE','KRAKEN_ON_COINBASE','COINBASE_ON_KRAKEN']),
  primaryMetric:'BOUNDARY_MINUS_PHASE_CONTROL_QUOTED_DIRECTIONAL_RETURN_BY_ROUTE',
  description:'Frozen future-return test of the already-preregistered 3-of-4 venue decisions, including own-venue and cross-venue transfer routes.',
});
export const CROSS_VENUE_PREDICTIVE_SPEC_FINGERPRINT=crypto.createHash('sha256').update(JSON.stringify(CROSS_VENUE_PREDICTIVE_SPEC)).digest('hex');
const round=(v,d=8)=>{const n=Number(v);if(!Number.isFinite(n))return null;const s=10**d;return Math.round(n*s)/s;};
const hasPrice=(v)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0;
function venueWindowOk(w,venue,instrument,windowSec){if(!w||Number(w.windowSec)!==windowSec)return false;if(venue==='KRAKEN'){const s=w.symbol==='BTC/USD'?'BTCUSD':w.symbol==='ETH/USD'?'ETHUSD':null;return s===instrument;}return w.canonicalInstrument===instrument;}
function entry(venue,w){const p=w?.price||{};return {venue,windowId:w.windowId,endTimestampMs:Number(w.endTimestampMs),mid:hasPrice(p.closeMid)?Number(p.closeMid):null,bid:hasPrice(p.closeBid)?Number(p.closeBid):null,ask:hasPrice(p.closeAsk)?Number(p.closeAsk):null,timeIntegrity:p? w?.timing?.timeIntegrity??null:null};}
function decisionOf(obs,venue){const d=venue==='KRAKEN'?obs?.venueDecisions?.kraken?.decision:obs?.venueDecisions?.coinbase?.decision;return ['LONG','SHORT','WAIT'].includes(d)?d:null;}
function routeDef(name){if(name==='KRAKEN_ON_KRAKEN')return {decisionVenue:'KRAKEN',executionVenue:'KRAKEN'};if(name==='COINBASE_ON_COINBASE')return {decisionVenue:'COINBASE',executionVenue:'COINBASE'};if(name==='KRAKEN_ON_COINBASE')return {decisionVenue:'KRAKEN',executionVenue:'COINBASE'};if(name==='COINBASE_ON_KRAKEN')return {decisionVenue:'COINBASE',executionVenue:'KRAKEN'};throw new Error('predictive-route-invalid');}
function quoted(decision,e,x){if(!['LONG','SHORT'].includes(decision)||!e||!x)return {available:false,entryPrice:null,exitPrice:null,returnBps:null};if(decision==='LONG'&&hasPrice(e.ask)&&hasPrice(x.bid))return {available:true,entryPrice:Number(e.ask),exitPrice:Number(x.bid),returnBps:(Number(x.bid)/Number(e.ask)-1)*10000};if(decision==='SHORT'&&hasPrice(e.bid)&&hasPrice(x.ask))return {available:true,entryPrice:Number(e.bid),exitPrice:Number(x.ask),returnBps:(Number(e.bid)-Number(x.ask))/Number(e.bid)*10000};return {available:false,entryPrice:null,exitPrice:null,returnBps:null};}
function market(decision,e,x){if(!['LONG','SHORT'].includes(decision)||!hasPrice(e?.mid)||!hasPrice(x?.mid))return null;const r=(Number(x.mid)/Number(e.mid)-1)*10000;return decision==='LONG'?r:-r;}

export function buildCrossVenuePredictiveSignal(observation,{krakenWindow,coinbaseWindow,generatedAtMs=Date.now()}={}){
  if(observation?.schemaVersion!==CROSS_VENUE_HYPOTHESIS_SCHEMA)throw new Error('predictive-observation-invalid');
  if(observation.specFingerprint!==CROSS_VENUE_FROZEN_SPEC_FINGERPRINT)throw new Error('predictive-source-spec-invalid');
  if(observation.eligible!==true||!['BOUNDARY_PRIMARY','PHASE_CONTROL'].includes(observation.sampleRole))throw new Error('predictive-observation-ineligible');
  if(!venueWindowOk(krakenWindow,'KRAKEN',observation.canonicalInstrument,5)||!venueWindowOk(coinbaseWindow,'COINBASE',observation.canonicalInstrument,5))throw new Error('predictive-entry-window-invalid');
  if(Number(krakenWindow.endTimestampMs)!==Number(observation.endTimestampMs)||Number(coinbaseWindow.endTimestampMs)!==Number(observation.endTimestampMs))throw new Error('predictive-entry-time-mismatch');
  const kd=decisionOf(observation,'KRAKEN'),cd=decisionOf(observation,'COINBASE');if(kd==null||cd==null)throw new Error('predictive-hidden-decision-required');
  if(Number(generatedAtMs)<Number(observation.endTimestampMs))throw new Error('predictive-generated-before-close');
  const signalId=crypto.createHash('sha256').update([CROSS_VENUE_PREDICTIVE_SPEC.hypothesisId,observation.observationId].join('|')).digest('hex');
  return {schemaVersion:CROSS_VENUE_PREDICTIVE_SIGNAL_SCHEMA,signalId,hypothesisId:CROSS_VENUE_PREDICTIVE_SPEC.hypothesisId,specFingerprint:CROSS_VENUE_PREDICTIVE_SPEC_FINGERPRINT,sourceObservationId:observation.observationId,sourcePairId:observation.pairId,sourceSpecFingerprint:observation.specFingerprint,canonicalInstrument:observation.canonicalInstrument,sampleRole:observation.sampleRole,matchedBoundary:observation.matchedBoundary,evaluationPartition:observation.evaluationPartition,inputWindowEndTimestampMs:Number(observation.endTimestampMs),generatedAtMs:Number(generatedAtMs),horizonsSec:[...CROSS_VENUE_PREDICTIVE_SPEC.horizonsSec],decisions:{kraken:kd,coinbase:cd},entry:{kraken:entry('KRAKEN',krakenWindow),coinbase:entry('COINBASE',coinbaseWindow)},governance:{frozenSpec:true,partitionInheritedFromPreregisteredSource:true,createdBeforeFutureOutcome:true,usesFutureOutcome:false,predictionInputAuthorized:false,adaptiveLearningAuthorized:false,automaticPromotion:false,executionAuthorized:false,realMoneyRouting:false,orderSubmission:false,actualNetEvAvailable:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}};
}

export function publicCrossVenuePredictiveSignal(signal){if(signal?.schemaVersion!==CROSS_VENUE_PREDICTIVE_SIGNAL_SCHEMA)throw new Error('predictive-signal-invalid');if(signal.evaluationPartition?.role!=='BLIND_EXAM')return signal;return {...signal,decisions:null,blindState:{status:'SEALED',futureOutcomeExposed:false,eligibleForLearning:false},governance:{...signal.governance,blindDecisionSealed:true}};}

function exitView(w,venue,instrument,target,maxDelay){if(!venueWindowOk(w,venue,instrument,1))return null;const end=Number(w.endTimestampMs),delay=end-target;if(delay<0||delay>maxDelay)return null;if(w?.timing?.timeIntegrity?.status!=='PASS'||w?.timing?.timeIntegrity?.prospectiveEligible!==true)return null;const p=w?.price||{};return {venue,windowId:w.windowId,endTimestampMs:end,delayMs:delay,mid:hasPrice(p.closeMid)?Number(p.closeMid):null,bid:hasPrice(p.closeBid)?Number(p.closeBid):null,ask:hasPrice(p.closeAsk)?Number(p.closeAsk):null,timeIntegrity:w.timing.timeIntegrity};}
export function matureCrossVenuePredictiveOutcome(signal,{horizonSec,krakenExitWindow,coinbaseExitWindow,maturedAtMs=Date.now()}={}){
  if(signal?.schemaVersion!==CROSS_VENUE_PREDICTIVE_SIGNAL_SCHEMA)throw new Error('predictive-signal-invalid');const h=Number(horizonSec);if(!CROSS_VENUE_PREDICTIVE_SPEC.horizonsSec.includes(h))throw new Error('predictive-horizon-invalid');
  const target=Number(signal.inputWindowEndTimestampMs)+h*1000,kx=exitView(krakenExitWindow,'KRAKEN',signal.canonicalInstrument,target,CROSS_VENUE_PREDICTIVE_SPEC.maxExitDelayMs),cx=exitView(coinbaseExitWindow,'COINBASE',signal.canonicalInstrument,target,CROSS_VENUE_PREDICTIVE_SPEC.maxExitDelayMs);if(!kx||!cx)return null;
  const entries={KRAKEN:signal.entry.kraken,COINBASE:signal.entry.coinbase},exits={KRAKEN:kx,COINBASE:cx},decisions={KRAKEN:signal.decisions.kraken,COINBASE:signal.decisions.coinbase};
  const routes=CROSS_VENUE_PREDICTIVE_SPEC.routes.map((name)=>{const d=routeDef(name),decision=decisions[d.decisionVenue],e=entries[d.executionVenue],x=exits[d.executionVenue],q=quoted(decision,e,x),mid=market(decision,e,x);return {route:name,decisionVenue:d.decisionVenue,executionVenue:d.executionVenue,decision,marketDirectionalReturnBps:round(mid),quotedExecution:{available:q.available,entryPrice:round(q.entryPrice,10),exitPrice:round(q.exitPrice,10),quotedDirectionalReturnBps:round(q.returnBps),quotedSpreadEmbedded:q.available,feeObserved:false,slippageObserved:false,fillObserved:false,actualNetEvAvailable:false},result:!['LONG','SHORT'].includes(decision)?'WAIT_OBSERVATION':mid>0?'WIN':mid<0?'LOSS':'FLAT',quotedResult:!q.available?'UNAVAILABLE':q.returnBps>0?'WIN':q.returnBps<0?'LOSS':'FLAT'};});
  return {schemaVersion:CROSS_VENUE_PREDICTIVE_OUTCOME_SCHEMA,outcomeId:crypto.createHash('sha256').update(['cross-venue-predictive-outcome-v1',signal.signalId,h].join('|')).digest('hex'),signalId:signal.signalId,hypothesisId:signal.hypothesisId,specFingerprint:signal.specFingerprint,canonicalInstrument:signal.canonicalInstrument,sampleRole:signal.sampleRole,evaluationPartition:signal.evaluationPartition,horizonSec:h,targetTimestampMs:target,maturedAtMs:Number(maturedAtMs),exits:{kraken:kx,coinbase:cx},routes,governance:{signalImmutable:true,outcomeSeparateFromSignal:true,blindPartitionInherited:true,transactionFeesModeled:false,slippageModeled:false,executionFillModeled:false,actualNetEvAvailable:false,noProfitabilityClaim:true,adaptiveLearningAuthorized:false,automaticPromotion:false,executionAuthorized:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}};
}

export function publicCrossVenuePredictiveOutcome(outcome){if(outcome?.schemaVersion!==CROSS_VENUE_PREDICTIVE_OUTCOME_SCHEMA)throw new Error('predictive-outcome-invalid');if(outcome.evaluationPartition?.role!=='BLIND_EXAM')return outcome;return {...outcome,routes:null,exits:null,blindState:{status:'SEALED',resultExposed:false,eligibleForLearning:false},governance:{...outcome.governance,blindOutcomeSealed:true}};}
