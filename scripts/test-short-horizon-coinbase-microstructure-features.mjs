import assert from 'node:assert/strict';
import {buildCoinbaseBookMicrostructureFeature,calculateCoinbaseTopOfBookOfi,extractCoinbaseTradeMicrostructureFeatures} from '../src/short-horizon/coinbase-microstructure-features.js';

const previous={trusted:true,bids:[{price:100,qty:2}],offers:[{price:101,qty:4}]};
const current={trusted:true,bids:[{price:100,qty:3}],offers:[{price:101,qty:3}]};
const integrity={status:'TRUSTED_UPDATE',providerSequenceNum:11,semantics:{localBookSynchronizationVerified:true,derivedMicrostructureAuthorized:true},governance:{derivedMicrostructureAuthorized:true}};

const ofi=calculateCoinbaseTopOfBookOfi({trusted:true,bids:previous.bids,asks:previous.offers},{trusted:true,bids:current.bids,asks:current.offers});
assert.equal(ofi.ofi,2);
assert.equal(ofi.bidEvent,1);
assert.equal(ofi.askEvent,-1);

const book=buildCoinbaseBookMicrostructureFeature({productId:'BTC-USD',previous,current,integrityEvidence:integrity,receivedTimestampMs:1000,sourceSha256:'a'.repeat(64),sequence:7});
assert.equal(book.eventType,'BOOK');
assert.equal(book.book.bestBid.price,100);
assert.equal(book.book.bestAsk.price,101);
assert.equal(book.book.mid,100.5);
assert.equal(book.book.microprice,100.5);
assert.equal(book.book.micropriceMinusMid,0);
assert.equal(book.book.top1Imbalance,0);
assert.equal(book.book.depthImbalance,0);
assert.equal(book.book.ofi,2);
assert.equal(book.integrity.derivedFromAuthorizedIntegrityEvidence,true);
assert.equal(book.semantics.ofiPositiveMeans,'BUY_PRESSURE');
assert.equal(book.semantics.crossVenueComparabilityClaim,false);
assert.equal(book.semantics.predictionInputAuthorized,false);

const untrusted=buildCoinbaseBookMicrostructureFeature({productId:'BTC-USD',previous,current,integrityEvidence:{status:'SEQUENCE_GAP',semantics:{localBookSynchronizationVerified:false,derivedMicrostructureAuthorized:false},governance:{derivedMicrostructureAuthorized:false}},receivedTimestampMs:1000,sourceSha256:'b'.repeat(64),sequence:8});
assert.equal(untrusted,null);
const unauthorized=buildCoinbaseBookMicrostructureFeature({productId:'BTC-USD',previous,current,integrityEvidence:{status:'TRUSTED_UPDATE',semantics:{localBookSynchronizationVerified:true,derivedMicrostructureAuthorized:false},governance:{derivedMicrostructureAuthorized:false}},receivedTimestampMs:1000,sourceSha256:'b'.repeat(64),sequence:8});
assert.equal(unauthorized,null);
assert.equal(buildCoinbaseBookMicrostructureFeature({productId:'DOGE-USD',previous,current,integrityEvidence:integrity}),null);

const tradeRaw=JSON.stringify({channel:'market_trades',timestamp:'2026-08-22T03:00:00.250Z',sequence_num:22,events:[{type:'update',trades:[
  {trade_id:'1',product_id:'BTC-USD',price:'100.50',size:'2',side:'SELL',time:'2026-08-22T03:00:00.249Z'},
  {trade_id:'2',product_id:'ETH-USD',price:'4200',size:'0.5',side:'BUY',time:'2026-08-22T03:00:00.249Z'},
]}]});
const trades=extractCoinbaseTradeMicrostructureFeatures(tradeRaw,{receivedTimestampMs:2000,sourceSha256:'c'.repeat(64),sequence:9});
assert.equal(trades.length,2);
assert.equal(trades[0].trade.makerSide,'SELL');
assert.equal(trades[0].trade.takerSide,'BUY');
assert.equal(trades[0].trade.signedQty,2);
assert.equal(trades[0].trade.signedNotional,201);
assert.equal(trades[1].trade.makerSide,'BUY');
assert.equal(trades[1].trade.takerSide,'SELL');
assert.equal(trades[1].trade.signedQty,-0.5);
assert.equal(trades[1].trade.signedNotional,-2100);
assert.equal(trades[0].semantics.providerSideRepresentsMakerSide,true);
assert.equal(trades[0].semantics.takerSideDerivedAsOppositeOfMaker,true);
assert.equal(trades[0].semantics.crossVenueComparabilityClaim,false);
assert.equal(trades[0].semantics.predictionInputAuthorized,false);

console.log('PASS v0.76 Coinbase trusted microstructure features');
