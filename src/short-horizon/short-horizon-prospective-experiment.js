import crypto from 'node:crypto';

export const PROSPECTIVE_EXPERIMENT_SCHEMA='voicetrader-short-horizon-prospective-signal-v1';
export const PROSPECTIVE_OUTCOME_SCHEMA='voicetrader-short-horizon-prospective-outcome-v1';
export const FROZEN_EXPERIMENTS=Object.freeze([
  Object.freeze({experimentId:'BOUNDARY_CONCORDANCE_V1',inputWindowSec:5,horizonsSec:Object.freeze([5,15,30,60]),boundaryBeforeSec:10,boundaryAfterSec:5,minVotes:3,description:'Boundary-conditioned concordance across trusted OFI, L2 imbalance, microprice and taker flow.'}),
  Object.freeze({experimentId:'BOUNDARY_HASH_NULL_V1',inputWindowSec:5,horizonsSec:Object.freeze([5,15,30,60]),boundaryBeforeSec:10,boundaryAfterSec:5,description:'Same eligible boundary windows, deterministic future-independent hash direction null.'}),
]);

const round=(v,d=8)=>{const n=Number(v);if(!Number.isFinite(n))return null;const s=10**d;return Math.round(n*s)/s;};
const sign=(v)=>{const n=Number(v);return !Number.isFinite(n)||n===0?0:n>0?1:-1;};
export const sha256=(value)=>crypto.createHash('sha256').update(String(value)).digest('hex');

export function boundaryEligibility(window,spec){
  const boundaries=window?.timing?.boundary||{};const matched=[];
  for(const name of ['5m','15m','60m']){const b=boundaries[name];if(!b)continue;const before=Number(b.secondsToBoundary);const after=Number(b.secondsSinceBoundary);if(b.atBoundary===true||(Number.isFinite(before)&&before>0&&before<=spec.boundaryBeforeSec)||(Number.isFinite(after)&&after>0&&after<=spec.boundaryAfterSec))matched.push(name);}
  return {eligible:matched.length>0,matchedBoundaries:matched};
}

function concordanceDecision(window,spec){
  const votes=[
    {name:'OFI_NORMALIZED',value:sign(window?.orderFlow?.ofiNormalizedByMeanDepth)},
    {name:'DEPTH_IMBALANCE',value:sign(window?.orderFlow?.depthImbalanceLast)},
    {name:'MICROPRICE_DELTA',value:sign(window?.price?.micropriceMinusMidLast)},
    {name:'TAKER_FLOW',value:sign(window?.trades?.signedNotionalSum)},
  ];
  const nonzero=votes.filter((v)=>v.value!==0);const buy=nonzero.filter((v)=>v.value>0).length;const sell=nonzero.filter((v)=>v.value<0).length;let decision='WAIT';if(buy>=spec.minVotes&&buy>sell)decision='LONG';else if(sell>=spec.minVotes&&sell>buy)decision='SHORT';
  return {decision,votes,buyVotes:buy,sellVotes:sell,nonzeroVotes:nonzero.length,heuristicConfidence:nonzero.length?round(Math.max(buy,sell)/nonzero.length,6):0};
}
function hashNullDecision(seed){const hex=sha256(seed);return parseInt(hex.slice(0,8),16)%2===0?'LONG':'SHORT';}

export function buildProspectiveSignals(window,{generatedAtMs=Date.now()}={}){
  if(!window||window.windowSec!==5||!window.windowId||!window.symbol)throw new Error('prospective-window-invalid');
  if(Number(generatedAtMs)<Number(window.endTimestampMs))throw new Error('prospective-generated-before-window-close');
  const out=[];
  for(const spec of FROZEN_EXPERIMENTS){const eligible=boundaryEligibility(window,spec);let result={decision:'WAIT',votes:[],buyVotes:0,sellVotes:0,nonzeroVotes:0,heuristicConfidence:0};if(eligible.eligible){if(spec.experimentId==='BOUNDARY_CONCORDANCE_V1')result=concordanceDecision(window,spec);else result={...result,decision:hashNullDecision(`${spec.experimentId}|${window.windowId}`),heuristicConfidence:null};}
    const signalId=['prospective-v1',spec.experimentId,window.windowId].join('|');
    out.push({schemaVersion:PROSPECTIVE_EXPERIMENT_SCHEMA,signalId,experimentId:spec.experimentId,specFingerprint:sha256(JSON.stringify(spec)),symbol:window.symbol,inputWindowId:window.windowId,inputWindowEndTimestampMs:window.endTimestampMs,generatedAtMs:Number(generatedAtMs),decision:result.decision,horizonsSec:[...spec.horizonsSec],boundary:{eligible:eligible.eligible,matchedBoundaries:eligible.matchedBoundaries},evidence:{votes:result.votes,buyVotes:result.buyVotes,sellVotes:result.sellVotes,nonzeroVotes:result.nonzeroVotes,heuristicConfidence:result.heuristicConfidence,entryMid:window.price?.closeMid??null,ofiNormalizedByMeanDepth:window.orderFlow?.ofiNormalizedByMeanDepth??null,depthImbalanceLast:window.orderFlow?.depthImbalanceLast??null,micropriceMinusMidLast:window.price?.micropriceMinusMidLast??null,signedNotionalSum:window.trades?.signedNotionalSum??null},governance:{frozenSpec:true,usesFutureOutcome:false,futureDataUnavailableAtDecision:true,confidenceIsCalibratedProbability:false,scoreIsExpectedReturn:false,predictionInputAuthorized:false,automaticPromotion:false,executionAuthorized:false,realMoneyRouting:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}});
  }
  return out;
}

export function matureProspectiveOutcome(signal,futureWindow,{maturedAtMs=Date.now(),maxDelayMs=2500}={}){
  if(!signal?.signalId||!futureWindow?.windowId||futureWindow.windowSec!==1||futureWindow.symbol!==signal.symbol)throw new Error('prospective-outcome-input-invalid');
  const horizonSec=Number(futureWindow.targetHorizonSec);if(!signal.horizonsSec?.includes(horizonSec))throw new Error('prospective-horizon-invalid');
  const targetTimestampMs=Number(signal.inputWindowEndTimestampMs)+horizonSec*1000;
  const exitTimestampMs=Number(futureWindow.endTimestampMs);const delayMs=exitTimestampMs-targetTimestampMs;if(delayMs<0||delayMs>maxDelayMs)return null;
  const entry=Number(signal.evidence?.entryMid),exit=Number(futureWindow.price?.closeMid);if(!(entry>0)||!(exit>0))return null;
  const marketReturnBps=(exit/entry-1)*10000;let directionalReturnBps=null;if(signal.decision==='LONG')directionalReturnBps=marketReturnBps;else if(signal.decision==='SHORT')directionalReturnBps=-marketReturnBps;
  return {schemaVersion:PROSPECTIVE_OUTCOME_SCHEMA,outcomeId:['prospective-outcome-v1',signal.signalId,horizonSec].join('|'),signalId:signal.signalId,experimentId:signal.experimentId,symbol:signal.symbol,horizonSec,targetTimestampMs,exitWindowId:futureWindow.windowId,exitTimestampMs,delayMs,maturedAtMs:Number(maturedAtMs),decision:signal.decision,marketReturnBps:round(marketReturnBps,8),directionalReturnBps:round(directionalReturnBps,8),result:signal.decision==='WAIT'?'WAIT_OBSERVATION':directionalReturnBps>0?'WIN':directionalReturnBps<0?'LOSS':'FLAT',provenance:{inputWindowId:signal.inputWindowId,signalSpecFingerprint:signal.specFingerprint,exitWindowDerivedFromTrustedL2Only:futureWindow.semantics?.derivedFromTrustedL2Only===true},governance:{signalImmutable:true,outcomeSeparateFromSignal:true,transactionCostsModeled:false,executionFillModeled:false,actualNetEvAvailable:false,automaticPromotion:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}};
}
