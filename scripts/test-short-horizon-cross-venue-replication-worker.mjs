import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {processOnce,buildWorkerSummary} from './local-node/cross-venue-replication-worker.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'voicetrader-v078-cross-venue-'));
const start=Date.UTC(2026,7,22,4,59,55),end=start+5000;
const boundary={'5m':{secondsSinceBoundary:0,secondsToBoundary:0,atBoundary:true},'15m':{secondsSinceBoundary:0,secondsToBoundary:0,atBoundary:true},'60m':{secondsSinceBoundary:300,secondsToBoundary:3300,atBoundary:false}};
const timeIntegrity={status:'PASS',prospectiveEligible:true,samples:4,meanProviderToReceiveMs:50,minProviderToReceiveMs:40,maxProviderToReceiveMs:60};
const kraken={schemaVersion:'voicetrader-kraken-boundary-window-v4',windowId:`kraken-provider-window-v1|BTC/USD|5|${start}`,symbol:'BTC/USD',windowSec:5,startTimestampMs:start,endTimestampMs:end,timing:{timeBasis:'PROVIDER_TIMESTAMP',boundary,timeIntegrity},coverage:{bookEventCount:5,tradeEventCount:2},price:{micropriceMinusMidLast:0.2},orderFlow:{ofiNormalizedByMeanDepth:0.4,depthImbalanceLast:0.3},trades:{signedNotionalSum:-25},semantics:{predictionInputAuthorized:false}};
const coinbase={schemaVersion:'voicetrader-coinbase-boundary-window-v1',windowId:`coinbase-provider-window-v1|BTC-USD|5|${start}`,venue:'COINBASE',productId:'BTC-USD',canonicalInstrument:'BTCUSD',windowSec:5,startTimestampMs:start,endTimestampMs:end,timing:{timeBasis:'PROVIDER_TIMESTAMP',boundary,timeIntegrity},coverage:{bookEventCount:6,tradeEventCount:3},price:{micropriceMinusMidLast:0.1},orderFlow:{ofiNormalizedByMeanDepth:0.2,depthImbalanceLast:-0.1},trades:{signedNotionalSum:-10},semantics:{predictionInputAuthorized:false,crossVenueComparabilityClaim:false}};

const krakenFile=path.join(root,'derived','kraken','windows','BTCUSD','5s','2026','08','22','04.ndjson');
const coinbaseFile=path.join(root,'derived','coinbase','windows','BTCUSD','5s','2026','08','22','04.ndjson');
fs.mkdirSync(path.dirname(krakenFile),{recursive:true});fs.mkdirSync(path.dirname(coinbaseFile),{recursive:true});
fs.writeFileSync(krakenFile,JSON.stringify(kraken)+'\n');fs.writeFileSync(coinbaseFile,JSON.stringify(coinbase)+'\n');
const freshState=()=>({schemaVersion:'voicetrader-cross-venue-replication-worker-state-v1',files:{},buffer:{},summary:{},counts:{krakenWindowsRead:0,coinbaseWindowsRead:0,pairsWritten:0,eligiblePairs:0,ineligiblePairs:0,duplicatesSkipped:0,parseErrors:0,bufferEvictions:0}});
const state=freshState();
processOnce(root,state,end+1000);
assert.equal(state.counts.krakenWindowsRead,1);assert.equal(state.counts.coinbaseWindowsRead,1);assert.equal(state.counts.pairsWritten,1);assert.equal(state.counts.eligiblePairs,1);assert.equal(state.counts.ineligiblePairs,0);assert.equal(state.counts.parseErrors,0);assert.equal(Object.keys(state.buffer).length,0);
const out=path.join(root,'derived','cross-venue','replication','BTCUSD','5s','2026','08','22','04.ndjson');
assert.equal(fs.existsSync(out),true);const rows=fs.readFileSync(out,'utf8').trim().split(/\r?\n/).map(JSON.parse);assert.equal(rows.length,1);assert.equal(rows[0].canonicalInstrument,'BTCUSD');assert.equal(rows[0].replication.availableMetrics,4);assert.equal(rows[0].replication.signAgreements,3);assert.equal(rows[0].governance.predictiveReplicationClaim,false);assert.equal(rows[0].governance.predictionInputAuthorized,false);
const summary=buildWorkerSummary(state,{generatedAtMs:end+2000});assert.equal(summary.groups.length,1);assert.equal(summary.groups[0].pairs,1);assert.equal(summary.groups[0].eligiblePairs,1);assert.equal(summary.groups[0].signAgreementRate,0.75);assert.equal(summary.governance.noPredictivePerformanceClaim,true);assert.equal(summary.governance.actualNetEvAvailable,false);

const replay=freshState();processOnce(root,replay,end+3000);assert.equal(replay.counts.pairsWritten,0);assert.equal(replay.counts.duplicatesSkipped,1);assert.equal(fs.readFileSync(out,'utf8').trim().split(/\r?\n/).length,1);

console.log('PASS v0.78 cross-venue append-only worker');
