import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {CoinbaseBookIntegrityTracker} from '../src/short-horizon/coinbase-book-integrity.js';

const wrap=(sequence_num,events)=>JSON.stringify({channel:'l2_data',timestamp:'2026-08-22T03:00:00Z',sequence_num,events});
const snapshot=wrap(10,[{type:'snapshot',product_id:'BTC-USD',updates:[
  {side:'bid',event_time:'2026-08-22T03:00:00.001Z',price_level:'100.00',new_quantity:'2'},
  {side:'bid',event_time:'2026-08-22T03:00:00.001Z',price_level:'99.00',new_quantity:'3'},
  {side:'offer',event_time:'2026-08-22T03:00:00.001Z',price_level:'101.00',new_quantity:'4'},
  {side:'offer',event_time:'2026-08-22T03:00:00.001Z',price_level:'102.00',new_quantity:'5'},
]}]);
const update=wrap(13,[{type:'update',product_id:'BTC-USD',updates:[
  {side:'bid',event_time:'2026-08-22T03:00:00.100Z',price_level:'100.00',new_quantity:'2.5'},
  {side:'offer',event_time:'2026-08-22T03:00:00.100Z',price_level:'101.00',new_quantity:'0'},
  {side:'offer',event_time:'2026-08-22T03:00:00.100Z',price_level:'101.50',new_quantity:'1.25'},
]}]);
const baseCtx=(raw,seq,providerSequence)=>({receivedTimestampMs:1000+seq,sourceSha256:crypto.createHash('sha256').update(raw).digest('hex'),connectionId:'c1',providerSequence});

const tracker=new CoinbaseBookIntegrityTracker({depth:10});
let e=tracker.applyRawMessage(snapshot,baseCtx(snapshot,10,{status:'BASELINE',verified:true,previous:null,current:10}));assert.equal(e.length,1);assert.equal(e[0].status,'TRUSTED_SNAPSHOT');assert.equal(e[0].reconnectRequired,false);assert.equal(e[0].book.bestBid,100);assert.equal(e[0].book.bestOffer,101);assert.equal(e[0].semantics.absoluteQuantityUpdates,true);assert.equal(e[0].semantics.sequenceScope,'FULL_CONNECTION_RAW_STREAM');assert.equal(e[0].semantics.sequenceContinuityValidatedUpstream,true);assert.equal(e[0].governance.derivedMicrostructureAuthorized,true);assert.equal(e[0].governance.predictionInputAuthorized,false);

// The next L2 message can legitimately have a non-consecutive sequence number when
// subscriptions/heartbeats/market_trades occupied the intervening raw connection sequences.
e=tracker.applyRawMessage(update,baseCtx(update,13,{status:'CONTIGUOUS',verified:true,previous:12,current:13}));assert.equal(e[0].status,'TRUSTED_UPDATE');assert.equal(e[0].book.bestBid,100);assert.equal(e[0].book.bids[0].qty,2.5);assert.equal(e[0].book.bestOffer,101.5);assert.equal(e[0].book.offerLevels,2);assert.equal(e[0].governance.derivedMicrostructureAuthorized,true);

const upstreamBlocked=new CoinbaseBookIntegrityTracker();
e=upstreamBlocked.applyRawMessage(snapshot,baseCtx(snapshot,10,{status:'GAP',verified:false,previous:8,current:10}));assert.equal(e[0].status,'PROVIDER_SEQUENCE_UNVERIFIED');assert.equal(e[0].reconnectRequired,true);assert.equal(e[0].governance.derivedMicrostructureAuthorized,false);

const before=new CoinbaseBookIntegrityTracker();const early=wrap(2,[{type:'update',product_id:'ETH-USD',updates:[{side:'bid',price_level:'10',new_quantity:'1'}]}]);e=before.applyRawMessage(early,baseCtx(early,2,{status:'CONTIGUOUS',verified:true,previous:1,current:2}));assert.equal(e[0].status,'UPDATE_BEFORE_SNAPSHOT');assert.equal(e[0].reconnectRequired,true);assert.equal(e[0].governance.derivedMicrostructureAuthorized,false);

const crossed=new CoinbaseBookIntegrityTracker();const bad=wrap(1,[{type:'snapshot',product_id:'ETH-USD',updates:[{side:'bid',price_level:'11',new_quantity:'1'},{side:'offer',price_level:'10',new_quantity:'1'}]}]);e=crossed.applyRawMessage(bad,baseCtx(bad,1,{status:'BASELINE',verified:true,previous:null,current:1}));assert.equal(e[0].status,'BOOK_CROSSED');assert.equal(e[0].reconnectRequired,true);assert.equal(e[0].governance.derivedMicrostructureAuthorized,false);

const twoProducts=new CoinbaseBookIntegrityTracker();
const btcSnap=wrap(100,[{type:'snapshot',product_id:'BTC-USD',updates:[{side:'bid',price_level:'100',new_quantity:'1'},{side:'offer',price_level:'101',new_quantity:'1'}]}]);
const ethSnap=wrap(103,[{type:'snapshot',product_id:'ETH-USD',updates:[{side:'bid',price_level:'50',new_quantity:'1'},{side:'offer',price_level:'51',new_quantity:'1'}]}]);
e=twoProducts.applyRawMessage(btcSnap,baseCtx(btcSnap,100,{status:'BASELINE',verified:true,previous:null,current:100}));assert.equal(e[0].status,'TRUSTED_SNAPSHOT');
e=twoProducts.applyRawMessage(ethSnap,baseCtx(ethSnap,103,{status:'CONTIGUOUS',verified:true,previous:102,current:103}));assert.equal(e[0].status,'TRUSTED_SNAPSHOT');
const books=twoProducts.snapshot();assert.equal(books['BTC-USD'].trusted,true);assert.equal(books['ETH-USD'].trusted,true);

console.log('PASS v0.76 Coinbase L2 integrity with full-connection provider sequence validation');
