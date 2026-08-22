import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {COINBASE_ADVANCED_TRADE_WS_URL,buildCoinbaseSubscriptions,classifyCoinbaseWire,buildCoinbaseWireMeta,frameCoinbaseJsonSequence} from '../src/short-horizon/local-node-coinbase-wire.js';
import {persistCoinbaseWireMessage,runCoinbaseRecorder,evaluateCoinbaseProviderSequence} from './local-node/coinbase-microstructure-recorder.mjs';

const subscriptions=buildCoinbaseSubscriptions();
assert.deepEqual(subscriptions,[
  {type:'subscribe',product_ids:['BTC-USD','ETH-USD'],channel:'level2'},
  {type:'subscribe',product_ids:['BTC-USD','ETH-USD'],channel:'market_trades'},
  {type:'subscribe',channel:'heartbeats'},
]);
assert.equal(JSON.stringify(subscriptions).includes('jwt'),false,'public capture must not require credentials');

const l2='{"channel":"l2_data","timestamp":"2026-08-22T03:00:00.123456Z","sequence_num":17,"events":[{"type":"update","product_id":"BTC-USD","updates":[{"side":"bid","event_time":"2026-08-22T03:00:00.120Z","price_level":"117000.00","new_quantity":"0.125"}]}]}';
const lc=classifyCoinbaseWire(l2);assert.equal(lc.isLevel2,true);assert.deepEqual(lc.products,['BTC-USD']);assert.equal(lc.providerSequenceNum,17);assert.equal(lc.sourceTimestampMs,Date.parse('2026-08-22T03:00:00.123456Z'));
const meta=buildCoinbaseWireMeta(l2,{receivedTimestampMs:Date.parse('2026-08-22T03:00:00.200Z'),connectionId:'c1',sequence:1});
assert.equal(meta.provider.endpoint,COINBASE_ADVANCED_TRADE_WS_URL);assert.equal(meta.provider.authenticationRequired,false);assert.equal(meta.semantics.providerSequenceContinuityVerified,false);assert.equal(meta.semantics.orderBookSynchronizationVerified,false);assert.equal(meta.semantics.derivedFeaturesAvailable,false);assert.equal(meta.governance.predictionInputAuthorized,false);assert.equal(meta.governance.orderSubmission,false);assert.equal(meta.runtimePolicy.googleCloudEnabled,false);assert.equal(meta.sourceSha256.length,64);
const framed=frameCoinbaseJsonSequence(l2);assert.equal(framed[0],0x1e);assert.equal(framed.subarray(1,-1).toString('utf8'),l2);

assert.deepEqual(evaluateCoinbaseProviderSequence(null,6),{status:'BASELINE',verified:true,previous:null,current:6,reconnectRequired:false});
assert.equal(evaluateCoinbaseProviderSequence(6,7).status,'CONTIGUOUS');
assert.equal(evaluateCoinbaseProviderSequence(7,9).status,'GAP');
assert.equal(evaluateCoinbaseProviderSequence(9,8).status,'OUT_OF_ORDER');
assert.equal(evaluateCoinbaseProviderSequence(9,null).status,'INVALID');

const trade='{"channel":"market_trades","timestamp":"2026-08-22T03:00:00.250Z","sequence_num":18,"events":[{"type":"update","trades":[{"trade_id":"123","product_id":"ETH-USD","price":"4200.10","size":"0.50","side":"BUY","time":"2026-08-22T03:00:00.249Z"}]}]}';
const tc=classifyCoinbaseWire(trade);assert.equal(tc.isMarketTrades,true);assert.deepEqual(tc.products,['ETH-USD']);
const heartbeat='{"channel":"heartbeats","timestamp":"2026-08-22T03:00:01Z","sequence_num":19,"events":[{"current_time":"2026-08-22 03:00:01 +0000 UTC","heartbeat_counter":1}]}';assert.equal(classifyCoinbaseWire(heartbeat).isHeartbeat,true);

const root=fs.mkdtempSync(path.join(os.tmpdir(),'voicetrader-v074-coinbase-'));
const persisted=persistCoinbaseWireMessage({rootDir:root,rawText:trade,receivedTimestampMs:Date.UTC(2026,7,22,3,0,1),connectionId:'c1',sequence:1});
assert.ok(persisted.paths.wireFile.includes(path.join('raw','coinbase','advanced-trade','2026','08','22')));const wire=fs.readFileSync(persisted.paths.wireFile);assert.equal(wire[0],0x1e);assert.equal(wire.subarray(1,-1).toString('utf8'),trade);const metaRecord=JSON.parse(fs.readFileSync(persisted.paths.metaFile,'utf8').trim());assert.equal(metaRecord.sourceSha256,persisted.meta.sourceSha256);assert.equal(metaRecord.semantics.exactProviderTextPreserved,true);
assert.throws(()=>buildCoinbaseWireMeta(l2,{receivedTimestampMs:1,connectionId:'x',sequence:0}),/coinbase-local-sequence-invalid/);

// Reproduce the live shape: provider sequence is continuous across the full connection,
// while L2-only messages are numerically non-consecutive because heartbeat/trade messages
// occupy the intervening sequence numbers.
const l2Snapshot=JSON.stringify({channel:'l2_data',timestamp:'2026-08-22T03:10:00Z',sequence_num:0,events:[
  {type:'snapshot',product_id:'BTC-USD',updates:[{side:'bid',event_time:'2026-08-22T03:10:00Z',price_level:'117000',new_quantity:'1'},{side:'offer',event_time:'2026-08-22T03:10:00Z',price_level:'117001',new_quantity:'1'}]},
  {type:'snapshot',product_id:'ETH-USD',updates:[{side:'bid',event_time:'2026-08-22T03:10:00Z',price_level:'4200',new_quantity:'2'},{side:'offer',event_time:'2026-08-22T03:10:00Z',price_level:'4201',new_quantity:'2'}]},
]});
const integrationHeartbeat=JSON.stringify({channel:'heartbeats',timestamp:'2026-08-22T03:10:00.050Z',sequence_num:1,events:[{current_time:'2026-08-22 03:10:00 +0000 UTC',heartbeat_counter:10}]});
const integrationTrade=JSON.stringify({channel:'market_trades',timestamp:'2026-08-22T03:10:00.100Z',sequence_num:2,events:[{type:'update',trades:[{trade_id:'900',product_id:'ETH-USD',price:'4200.5',size:'0.25',side:'SELL',time:'2026-08-22T03:10:00.090Z'}]}]});
const l2Update=JSON.stringify({channel:'l2_data',timestamp:'2026-08-22T03:10:00.150Z',sequence_num:3,events:[{type:'update',product_id:'BTC-USD',updates:[{side:'bid',event_time:'2026-08-22T03:10:00.150Z',price_level:'117000',new_quantity:'1.5'}]}]});
const integrationRoot=fs.mkdtempSync(path.join(os.tmpdir(),'voicetrader-v076-coinbase-integration-'));
const sent=[];let shouldStop=false,clock=Date.UTC(2026,7,22,3,10,0);
class FakeWebSocket{
  constructor(url){this.url=url;this.handlers={};queueMicrotask(()=>this.handlers.open?.({}));}
  addEventListener(name,handler){this.handlers[name]=handler;}
  send(raw){sent.push(JSON.parse(raw));if(sent.length===3)queueMicrotask(()=>{this.handlers.message?.({data:l2Snapshot});this.handlers.message?.({data:integrationHeartbeat});this.handlers.message?.({data:integrationTrade});shouldStop=true;this.handlers.message?.({data:l2Update});});}
  close(){}
}
const integration=await runCoinbaseRecorder({rootDir:integrationRoot,WebSocketImpl:FakeWebSocket,now:()=>clock++,sleep:async()=>{},stopSignal:()=>shouldStop,warnFreeBytes:0,hardStopFreeBytes:0});
assert.equal(integration.status,'STOPPED');assert.equal(integration.counts.messages,4);assert.equal(integration.counts.level2,2);assert.equal(integration.counts.marketTrades,1);assert.equal(integration.counts.heartbeats,1);assert.equal(integration.counts.trustedSnapshots,2);assert.equal(integration.counts.trustedUpdates,1);assert.equal(integration.counts.sequenceGaps,0);assert.equal(integration.counts.sequenceOutOfOrder,0);assert.equal(integration.counts.bookFeatures,3);assert.equal(integration.counts.bookOfiFeatures,1);assert.equal(integration.counts.tradeFeatures,1);assert.equal(integration.integrity.providerSequenceContinuityVerified,true);assert.equal(integration.integrity.providerSequenceScope,'FULL_CONNECTION_RAW_STREAM');assert.equal(integration.integrity.orderBookSynchronizationVerified,true);assert.equal(integration.connection.providerSequence.current,3);assert.equal(integration.connection.providerSequence.messagesObserved,4);assert.equal(integration.semantics.derivedFeaturesAvailable,true);assert.equal(integration.semantics.ofiAvailable,true);assert.equal(integration.semantics.signedTakerFlowAvailable,true);assert.equal(integration.semantics.crossVenueComparabilityClaim,false);assert.equal(integration.semantics.predictionInputAuthorized,false);assert.deepEqual(sent,subscriptions);assert.equal(integration.runtimePolicy.authenticationRequired,false);
const btcFeatureFile=path.join(integrationRoot,'derived','coinbase','microstructure','BTCUSD','2026','08','22','03.ndjson');
const ethFeatureFile=path.join(integrationRoot,'derived','coinbase','microstructure','ETHUSD','2026','08','22','03.ndjson');
const btcFeatures=fs.readFileSync(btcFeatureFile,'utf8').trim().split(/\r?\n/).map(JSON.parse);const ethFeatures=fs.readFileSync(ethFeatureFile,'utf8').trim().split(/\r?\n/).map(JSON.parse);
assert.equal(btcFeatures.filter((x)=>x.eventType==='BOOK').length,2);assert.equal(btcFeatures.at(-1).book.ofi,0.5);assert.equal(ethFeatures.filter((x)=>x.eventType==='BOOK').length,1);const ethTrade=ethFeatures.find((x)=>x.eventType==='TRADE');assert.equal(ethTrade.trade.makerSide,'SELL');assert.equal(ethTrade.trade.takerSide,'BUY');assert.equal(ethTrade.trade.signedQty,0.25);
console.log('PASS v0.76 Coinbase full-connection sequence + public raw + L2 integrity + microstructure');
