import assert from 'node:assert/strict';
import {
  calculateTopOfBookOfi,
  buildBookMicrostructureFeature,
  extractTradeMicrostructureFeatures,
} from '../src/short-horizon/kraken-microstructure-features.js';

const previous={trusted:true,bids:[{price:100,qty:2},{price:99,qty:3}],asks:[{price:101,qty:1},{price:102,qty:4}]};
const current={trusted:true,bids:[{price:100,qty:3},{price:99,qty:3}],asks:[{price:101,qty:0.5},{price:102,qty:4}]};
const ofi=calculateTopOfBookOfi(previous,current);
assert.equal(ofi.ofi,1.5);
const feature=buildBookMicrostructureFeature({
  symbol:'BTC/USD',previous,current,
  integrityEvidence:{match:true,trustedAfter:true,providerChecksum:1,localChecksum:1},
  receivedTimestampMs:1,sourceSha256:'source',sequence:2,
});
assert.equal(feature.book.ofi,1.5);
assert.ok(feature.book.microprice>100&&feature.book.microprice<101);
assert.equal(feature.integrity.bookSynchronizationVerified,true);
assert.equal(feature.semantics.ofiPositiveMeans,'BUY_PRESSURE');
assert.equal(feature.semantics.predictionInputAuthorized,false);
assert.equal(feature.runtimePolicy.googleCloudEnabled,false);
assert.equal(buildBookMicrostructureFeature({symbol:'BTC/USD',previous,current,integrityEvidence:{match:false,trustedAfter:false}}),null);

const tradeRaw='{"channel":"trade","type":"update","data":[{"symbol":"BTC/USD","side":"buy","qty":0.20,"price":100.5,"trade_id":7,"timestamp":"x"},{"symbol":"BTC/USD","side":"sell","qty":0.10,"price":100.4,"trade_id":8,"timestamp":"y"}]}';
const trades=extractTradeMicrostructureFeatures(tradeRaw,{receivedTimestampMs:2,sourceSha256:'trade-source',sequence:3});
assert.equal(trades.length,2);
assert.equal(trades[0].trade.signedQty,0.2);
assert.equal(trades[1].trade.signedQty,-0.1);
assert.equal(trades[0].semantics.tradeSideRepresentsTakerSide,true);
assert.equal(trades[0].semantics.predictionInputAuthorized,false);

console.log('PASS v0.53 checksum-gated Kraken microstructure features');
