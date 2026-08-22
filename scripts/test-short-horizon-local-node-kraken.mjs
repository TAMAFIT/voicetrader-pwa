import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  buildKrakenSubscriptions,
  classifyKrakenWire,
  buildKrakenWireMeta,
  frameJsonSequence,
} from '../src/short-horizon/local-node-kraken-wire.js';
import { persistKrakenWireMessage } from './local-node/kraken-microstructure-recorder.mjs';

const subscriptions=buildKrakenSubscriptions();
assert.equal(subscriptions[0].params.channel,'book');
assert.equal(subscriptions[0].params.depth,10);
assert.deepEqual(subscriptions[0].params.symbol,['BTC/USD','ETH/USD']);
assert.equal(subscriptions[1].params.channel,'trade');

const rawBook='{"channel":"book","type":"update","data":[{"symbol":"BTC/USD","bids":[{"price":100.10,"qty":0.0200}],"asks":[],"checksum":123}]}';
const classification=classifyKrakenWire(rawBook);
assert.equal(classification.isBook,true);
assert.deepEqual(classification.symbols,['BTC/USD']);
const meta=buildKrakenWireMeta(rawBook,{receivedTimestampMs:1000,connectionId:'c1',sequence:1});
assert.equal(meta.semantics.checksumVerified,false);
assert.equal(meta.semantics.ofiAvailable,false);
assert.equal(meta.runtimePolicy.googleCloudEnabled,false);
assert.equal(meta.governance.orderSubmission,false);
assert.equal(meta.sourceSha256.length,64);
const framed=frameJsonSequence(rawBook);
assert.equal(framed[0],0x1e);
assert.equal(framed.subarray(1,-1).toString('utf8'),rawBook);

const root=fs.mkdtempSync(path.join(os.tmpdir(),'voicetrader-v051-'));
const rawTrade='{"channel":"trade","type":"update","data":[{"symbol":"BTC/USD","side":"buy","qty":0.0012300,"price":123.4500,"trade_id":99,"timestamp":"2026-08-22T00:00:00Z"}]}';
const persisted=persistKrakenWireMessage({
  rootDir:root,
  rawText:rawTrade,
  receivedTimestampMs:Date.UTC(2026,7,22,0,0,1),
  connectionId:'c1',
  sequence:1,
});
assert.equal(persisted.meta.isTrade,true);
assert.equal(persisted.meta.runtimePolicy.cloudUploadEnabled,false);
const wire=fs.readFileSync(persisted.paths.wireFile);
assert.equal(wire[0],0x1e);
assert.equal(wire.subarray(1,-1).toString('utf8'),rawTrade);
const metaRecord=JSON.parse(fs.readFileSync(persisted.paths.metaFile,'utf8').trim());
assert.equal(metaRecord.sourceSha256,persisted.meta.sourceSha256);
assert.equal(metaRecord.semantics.exactProviderTextPreserved,true);

console.log('PASS v0.51 Kraken local raw microstructure');
