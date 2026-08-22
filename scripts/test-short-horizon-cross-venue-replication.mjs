import assert from 'node:assert/strict';
import {pairCrossVenueWindows,buildCrossVenueReplicationSummary,canonicalFromKrakenSymbol} from '../src/short-horizon/cross-venue-replication.js';

const start=Date.UTC(2026,7,22,3,4,55),end=start+5000;
const boundary={'5m':{secondsSinceBoundary:0,secondsToBoundary:0,atBoundary:true},'15m':{secondsSinceBoundary:300,secondsToBoundary:600,atBoundary:false},'60m':{secondsSinceBoundary:300,secondsToBoundary:3300,atBoundary:false}};
const timeIntegrity={status:'PASS',prospectiveEligible:true,samples:5,meanProviderToReceiveMs:50,minProviderToReceiveMs:40,maxProviderToReceiveMs:70};
const kraken={schemaVersion:'voicetrader-kraken-boundary-window-v4',windowId:`kraken|BTC/USD|5|${start}`,symbol:'BTC/USD',windowSec:5,startTimestampMs:start,endTimestampMs:end,timing:{timeBasis:'PROVIDER_TIMESTAMP',boundary,timeIntegrity},coverage:{bookEventCount:5,tradeEventCount:2},price:{micropriceMinusMidLast:0.25},orderFlow:{ofiNormalizedByMeanDepth:0.4,depthImbalanceLast:-0.2},trades:{signedNotionalSum:100}};
const coinbase={schemaVersion:'voicetrader-coinbase-boundary-window-v1',windowId:`coinbase|BTC-USD|5|${start}`,venue:'COINBASE',productId:'BTC-USD',canonicalInstrument:'BTCUSD',windowSec:5,startTimestampMs:start,endTimestampMs:end,timing:{timeBasis:'PROVIDER_TIMESTAMP',boundary,timeIntegrity},coverage:{bookEventCount:6,tradeEventCount:3},price:{micropriceMinusMidLast:0.1},orderFlow:{ofiNormalizedByMeanDepth:0.2,depthImbalanceLast:0.1},trades:{signedNotionalSum:50}};

assert.equal(canonicalFromKrakenSymbol('BTC/USD'),'BTCUSD');
assert.equal(canonicalFromKrakenSymbol('ETH/USD'),'ETHUSD');
assert.equal(canonicalFromKrakenSymbol('DOGE/USD'),null);

const pair=pairCrossVenueWindows(kraken,coinbase);
assert.equal(pair.canonicalInstrument,'BTCUSD');
assert.equal(pair.windowSec,5);
assert.equal(pair.eligibility.timeIntegrityPass,true);
assert.equal(pair.eligibility.bookCoveragePresent,true);
assert.equal(pair.eligibility.boundaryAligned,true);
assert.equal(pair.eligibility.descriptiveEligible,true);
assert.equal(pair.replication.availableMetrics,4);
assert.equal(pair.replication.signAgreements,3);
assert.equal(pair.replication.signAgreementRate,0.75);
assert.equal(pair.metrics.find((m)=>m.name==='DEPTH_IMBALANCE').signAgreement,false);
assert.equal(pair.metrics.find((m)=>m.name==='OFI_NORMALIZED').signAgreement,true);
assert.equal(pair.governance.descriptiveOnly,true);
assert.equal(pair.governance.crossVenueComparabilityClaim,false);
assert.equal(pair.governance.predictiveReplicationClaim,false);
assert.equal(pair.governance.predictionInputAuthorized,false);
assert.equal(pair.governance.executionAuthorized,false);
assert.equal(pair.governance.actualNetEvAvailable,false);

const failedTime=structuredClone(coinbase);failedTime.timing.timeIntegrity={...timeIntegrity,status:'WARN',prospectiveEligible:false};const bad=pairCrossVenueWindows(kraken,failedTime);assert.equal(bad.eligibility.timeIntegrityPass,false);assert.equal(bad.eligibility.descriptiveEligible,false);
const sparse=structuredClone(coinbase);sparse.orderFlow.depthImbalanceLast=null;sparse.price.micropriceMinusMidLast=null;const sparsePair=pairCrossVenueWindows(kraken,sparse);assert.equal(sparsePair.eligibility.comparableMetrics,2);assert.equal(sparsePair.eligibility.descriptiveEligible,false);

assert.throws(()=>pairCrossVenueWindows(kraken,{...coinbase,canonicalInstrument:'ETHUSD'}),/cross-venue-instrument-mismatch/);
assert.throws(()=>pairCrossVenueWindows(kraken,{...coinbase,startTimestampMs:start+1000}),/cross-venue-window-mismatch/);

const summary=buildCrossVenueReplicationSummary([pair,bad]);
assert.equal(summary.groups.length,1);
assert.equal(summary.groups[0].pairs,2);
assert.equal(summary.groups[0].eligiblePairs,1);
assert.equal(summary.groups[0].signAgreementRate,0.75);
assert.equal(summary.governance.descriptiveOnly,true);
assert.equal(summary.governance.noPredictivePerformanceClaim,true);
assert.equal(summary.governance.predictionInputAuthorized,false);

console.log('PASS v0.78 descriptive cross-venue replication');
