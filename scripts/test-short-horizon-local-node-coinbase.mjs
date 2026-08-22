import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {COINBASE_ADVANCED_TRADE_WS_URL,buildCoinbaseSubscriptions,classifyCoinbaseWire,buildCoinbaseWireMeta,frameCoinbaseJsonSequence} from '../src/short-horizon/local-node-coinbase-wire.js';
import {persistCoinbaseWireMessage} from './local-node/coinbase-microstructure-recorder.mjs';

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

const trade='{"channel":"market_trades","timestamp":"2026-08-22T03:00:00.250Z","sequence_num":18,"events":[{"type":"update","trades":[{"trade_id":"123","product_id":"ETH-USD","price":"4200.10","size":"0.50","side":"BUY","time":"2026-08-22T03:00:00.249Z"}]}]}';
const tc=classifyCoinbaseWire(trade);assert.equal(tc.isMarketTrades,true);assert.deepEqual(tc.products,['ETH-USD']);
const heartbeat='{"channel":"heartbeats","timestamp":"2026-08-22T03:00:01Z","sequence_num":19,"events":[{"current_time":"2026-08-22 03:00:01 +0000 UTC","heartbeat_counter":1}]}';assert.equal(classifyCoinbaseWire(heartbeat).isHeartbeat,true);

const root=fs.mkdtempSync(path.join(os.tmpdir(),'voicetrader-v074-coinbase-'));
const persisted=persistCoinbaseWireMessage({rootDir:root,rawText:trade,receivedTimestampMs:Date.UTC(2026,7,22,3,0,1),connectionId:'c1',sequence:1});
assert.ok(persisted.paths.wireFile.includes(path.join('raw','coinbase','advanced-trade','2026','08','22')));const wire=fs.readFileSync(persisted.paths.wireFile);assert.equal(wire[0],0x1e);assert.equal(wire.subarray(1,-1).toString('utf8'),trade);const metaRecord=JSON.parse(fs.readFileSync(persisted.paths.metaFile,'utf8').trim());assert.equal(metaRecord.sourceSha256,persisted.meta.sourceSha256);assert.equal(metaRecord.semantics.exactProviderTextPreserved,true);

assert.throws(()=>buildCoinbaseWireMeta(l2,{receivedTimestampMs:1,connectionId:'x',sequence:0}),/coinbase-local-sequence-invalid/);
console.log('PASS v0.74 Coinbase public exact-wire capture');
