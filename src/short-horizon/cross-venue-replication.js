import crypto from 'node:crypto';

export const CROSS_VENUE_REPLICATION_SCHEMA='voicetrader-cross-venue-replication-v1';
export const CROSS_VENUE_REPLICATION_SUMMARY_SCHEMA='voicetrader-cross-venue-replication-summary-v1';
const round=(v,d=8)=>{const n=Number(v);if(!Number.isFinite(n))return null;const s=10**d;return Math.round(n*s)/s;};
const sign=(v)=>{const n=Number(v);return !Number.isFinite(n)||n===0?0:n>0?1:-1;};
const presentNumber=(v)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));

export function canonicalFromKrakenSymbol(symbol){const s=String(symbol||'');if(s==='BTC/USD')return 'BTCUSD';if(s==='ETH/USD')return 'ETHUSD';return null;}
function canonicalFromWindow(window,venue){if(venue==='KRAKEN')return canonicalFromKrakenSymbol(window?.symbol);if(venue==='COINBASE')return window?.canonicalInstrument||null;return null;}
function passTime(window){return window?.timing?.timeBasis==='PROVIDER_TIMESTAMP'&&window?.timing?.timeIntegrity?.status==='PASS'&&window?.timing?.timeIntegrity?.prospectiveEligible===true;}
function metric(name,krakenValue,coinbaseValue){const available=presentNumber(krakenValue)&&presentNumber(coinbaseValue),k=available?Number(krakenValue):null,c=available?Number(coinbaseValue):null,ks=available?sign(k):null,cs=available?sign(c):null;return {name,available,krakenValue:available?round(k):null,coinbaseValue:available?round(c):null,krakenSign:ks,coinbaseSign:cs,signAgreement:available?ks===cs:null,bothDirectional:available?ks!==0&&cs!==0:false};}
function boundarySignature(window){const b=window?.timing?.boundary||{};return ['5m','15m','60m'].map((k)=>({name:k,atBoundary:b?.[k]?.atBoundary===true,secondsSinceBoundary:presentNumber(b?.[k]?.secondsSinceBoundary)?Number(b[k].secondsSinceBoundary):null,secondsToBoundary:presentNumber(b?.[k]?.secondsToBoundary)?Number(b[k].secondsToBoundary):null}));}

export function pairCrossVenueWindows(krakenWindow,coinbaseWindow){
  const kInstrument=canonicalFromWindow(krakenWindow,'KRAKEN'),cInstrument=canonicalFromWindow(coinbaseWindow,'COINBASE');
  if(!kInstrument||!cInstrument||kInstrument!==cInstrument)throw new Error('cross-venue-instrument-mismatch');
  if(Number(krakenWindow?.windowSec)!==Number(coinbaseWindow?.windowSec)||Number(krakenWindow?.startTimestampMs)!==Number(coinbaseWindow?.startTimestampMs)||Number(krakenWindow?.endTimestampMs)!==Number(coinbaseWindow?.endTimestampMs))throw new Error('cross-venue-window-mismatch');
  const metrics=[
    metric('OFI_NORMALIZED',krakenWindow?.orderFlow?.ofiNormalizedByMeanDepth,coinbaseWindow?.orderFlow?.ofiNormalizedByMeanDepth),
    metric('DEPTH_IMBALANCE',krakenWindow?.orderFlow?.depthImbalanceLast,coinbaseWindow?.orderFlow?.depthImbalanceLast),
    metric('MICROPRICE_DELTA',krakenWindow?.price?.micropriceMinusMidLast,coinbaseWindow?.price?.micropriceMinusMidLast),
    metric('TAKER_FLOW',krakenWindow?.trades?.signedNotionalSum,coinbaseWindow?.trades?.signedNotionalSum),
  ];
  const available=metrics.filter((m)=>m.available),directional=available.filter((m)=>m.bothDirectional),agreements=available.filter((m)=>m.signAgreement===true).length,directionalAgreements=directional.filter((m)=>m.signAgreement===true).length;
  const timeEligible=passTime(krakenWindow)&&passTime(coinbaseWindow),coverageEligible=Number(krakenWindow?.coverage?.bookEventCount)>0&&Number(coinbaseWindow?.coverage?.bookEventCount)>0,descriptiveEligible=timeEligible&&coverageEligible&&available.length>=3;
  const kBoundary=boundarySignature(krakenWindow),cBoundary=boundarySignature(coinbaseWindow),boundaryAligned=JSON.stringify(kBoundary)===JSON.stringify(cBoundary);
  const pairId=crypto.createHash('sha256').update([kInstrument,krakenWindow.windowSec,krakenWindow.startTimestampMs,krakenWindow.windowId,coinbaseWindow.windowId].join('|')).digest('hex');
  return {schemaVersion:CROSS_VENUE_REPLICATION_SCHEMA,pairId,canonicalInstrument:kInstrument,windowSec:Number(krakenWindow.windowSec),startTimestampMs:Number(krakenWindow.startTimestampMs),endTimestampMs:Number(krakenWindow.endTimestampMs),sources:{krakenWindowId:krakenWindow.windowId,coinbaseWindowId:coinbaseWindow.windowId},eligibility:{timeIntegrityPass:timeEligible,bookCoveragePresent:coverageEligible,boundaryAligned,descriptiveEligible,minimumComparableMetrics:3,comparableMetrics:available.length},boundary:{kraken:kBoundary,coinbase:cBoundary},metrics,replication:{availableMetrics:available.length,directionalMetrics:directional.length,signAgreements:agreements,directionalSignAgreements:directionalAgreements,signAgreementRate:available.length?round(agreements/available.length,6):null,directionalSignAgreementRate:directional.length?round(directionalAgreements/directional.length,6):null},governance:{descriptiveOnly:true,fieldDefinitionsAlignedForAudit:true,crossVenueComparabilityClaim:false,predictiveReplicationClaim:false,usesFutureOutcome:false,predictionInputAuthorized:false,automaticPromotion:false,executionAuthorized:false,realMoneyRouting:false,orderSubmission:false,actualNetEvAvailable:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}};
}

export function buildCrossVenueReplicationSummary(records){
  const rows=[...(records||[])].filter((r)=>r?.schemaVersion===CROSS_VENUE_REPLICATION_SCHEMA),groups={};
  for(const r of rows){const key=[r.canonicalInstrument,r.windowSec].join('|');if(!groups[key])groups[key]={canonicalInstrument:r.canonicalInstrument,windowSec:r.windowSec,pairs:0,eligiblePairs:0,availableMetrics:0,signAgreements:0,directionalMetrics:0,directionalSignAgreements:0};const g=groups[key];g.pairs++;if(r.eligibility?.descriptiveEligible)g.eligiblePairs++;g.availableMetrics+=Number(r.replication?.availableMetrics||0);g.signAgreements+=Number(r.replication?.signAgreements||0);g.directionalMetrics+=Number(r.replication?.directionalMetrics||0);g.directionalSignAgreements+=Number(r.replication?.directionalSignAgreements||0);}
  return {schemaVersion:CROSS_VENUE_REPLICATION_SUMMARY_SCHEMA,groups:Object.values(groups).map((g)=>({...g,signAgreementRate:g.availableMetrics?round(g.signAgreements/g.availableMetrics,6):null,directionalSignAgreementRate:g.directionalMetrics?round(g.directionalSignAgreements/g.directionalMetrics,6):null})).sort((a,b)=>a.canonicalInstrument.localeCompare(b.canonicalInstrument)||a.windowSec-b.windowSec),governance:{descriptiveOnly:true,noPredictivePerformanceClaim:true,noIidSignificanceClaim:true,predictionInputAuthorized:false,automaticPromotion:false,actualNetEvAvailable:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}};
}
