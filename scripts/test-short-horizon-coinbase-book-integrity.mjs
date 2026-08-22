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
const update=wrap(11,[{type:'update',product_id:'BTC-USD',updates:[
  {side:'bid',event_time:'2026-08-22T03:00:00.100Z',price_level:'100.00',new_quantity:'2.5'},
  {side:'offer',event_time:'2026-08-22T03:00:00.100Z',price_level:'101.00',new_quantity:'0'},
  {side:'offer',event_time:'2026-08-22T03:00:00.100Z',price_level:'101.50',new_quantity:'1.25'},
]}]);
const ctx=(raw,seq)=>({receivedTimestampMs:1000+seq,sourceSha256:crypto.createHash('sha256').update(raw).digest('hex'),connectionId:'c1'});

const tracker=new CoinbaseBookIntegrityTracker({depth:10});
let e=tracker.applyRawMessage(snapshot,ctx(snapshot,10));assert.equal(e.length,1);assert.equal(e[0].status,'TRUSTED_SNAPSHOT');assert.equal(e[0].reconnectRequired,false);assert.equal(e[0].book.bestBid,100);assert.equal(e[0].book.bestOffer,101);assert.equal(e[0].semantics.absoluteQuantityUpdates,true);
e=tracker.applyRawMessage(update,ctx(update,11));assert.equal(e[0].status,'TRUSTED_UPDATE');assert.equal(e[0].book.bestBid,100);assert.equal(e[0].book.bids[0].qty,2.5);assert.equal(e[0].book.bestOffer,101.5);assert.equal(e[0].book.offerLevels,2);

const gap=wrap(13,[{type:'update',product_id:'BTC-USD',updates:[{side:'bid',price_level:'100.00',new_quantity:'1'}]}]);e=tracker.applyRawMessage(gap,ctx(gap,13));assert.equal(e[0].status,'SEQUENCE_GAP');assert.equal(e[0].reconnectRequired,true);assert.equal(tracker.snapshot()['BTC-USD'].trusted,false);

const before=new CoinbaseBookIntegrityTracker();const early=wrap(2,[{type:'update',product_id:'ETH-USD',updates:[{side:'bid',price_level:'10',new_quantity:'1'}]}]);e=before.applyRawMessage(early,ctx(early,2));assert.equal(e[0].status,'UPDATE_BEFORE_SNAPSHOT');assert.equal(e[0].reconnectRequired,true);

const crossed=new CoinbaseBookIntegrityTracker();const bad=wrap(1,[{type:'snapshot',product_id:'ETH-USD',updates:[{side:'bid',price_level:'11',new_quantity:'1'},{side:'offer',price_level:'10',new_quantity:'1'}]}]);e=crossed.applyRawMessage(bad,ctx(bad,1));assert.equal(e[0].status,'BOOK_CROSSED');assert.equal(e[0].reconnectRequired,true);

const outOfOrder=new CoinbaseBookIntegrityTracker();outOfOrder.applyRawMessage(snapshot,ctx(snapshot,10));const older=wrap(9,[{type:'update',product_id:'BTC-USD',updates:[]}]);e=outOfOrder.applyRawMessage(older,ctx(older,9));assert.equal(e[0].status,'SEQUENCE_OUT_OF_ORDER');assert.equal(e[0].reconnectRequired,true);

console.log('PASS v0.75 Coinbase L2 integrity');
