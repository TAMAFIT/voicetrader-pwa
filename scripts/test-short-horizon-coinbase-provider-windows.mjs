import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {aggregateCoinbaseMicrostructureEvents,canonicalInstrument,coinbaseMarketEventTimestampMs} from '../src/short-horizon/coinbase-boundary-windows.js';
import {processOnce} from './local-node/coinbase-boundary-window-worker.mjs';

const base=Date.UTC(2026,7,22,3,4,55);
const book=(ms,{ofi=2,depthImbalance=0.2,micro=0.1,bidQty=3,askQty=2}={})=>({eventType:'BOOK',provider:'coinbase-advanced-trade',productId:'BTC-USD',providerTimestampMs:ms,providerTimestamp:new Date(ms).toISOString(),receivedTimestampMs:ms+50,book:{mid:100,bestBid:{price:99.5},bestAsk:{price:100.5},spreadBps:100,micropriceMinusMid:micro,top1Imbalance:(bidQty-askQty)/(bidQty+askQty),depthImbalance,ofi,bidDepth:bidQty,askDepth:askQty},integrity:{bookSynchronizationVerified:true},semantics:{predictionInputAuthorized:false}});
const trade=(ms)=>({eventType:'TRADE',provider:'coinbase-advanced-trade',productId:'BTC-USD',providerTimestampMs:ms,providerTimestamp:new Date(ms).toISOString(),receivedTimestampMs:ms+60,trade:{takerSide:'BUY',qty:0.5,signedQty:0.5,signedNotional:50},semantics:{predictionInputAuthorized:false}});

assert.equal(canonicalInstrument('BTC-USD'),'BTCUSD');
assert.equal(canonicalInstrument('ETH-USD'),'ETHUSD');
assert.equal(canonicalInstrument('DOGE-USD'),null);
assert.equal(coinbaseMarketEventTimestampMs(book(base)),base);

const events=[book(base+100),book(base+2100,{ofi:1,depthImbalance:0.1,micro:0.05}),trade(base+2500),book(base+4900,{ofi:-0.5,depthImalance:-0.05,micro:-0.01})];
const windows=aggregateCoinbaseMicrostructureEvents(events,{windowSec:5,nowMs:base+10_000});
assert.equal(windows.length,1);
const w=windows[0];
assert.equal(w.schemaVersion,'voicetrader-coinbase-boundary-window-v1');
assert.equal(w.venue,'COINBASE');
assert.equal(w.productId,'BTC-USD');
assert.equal(w.canonicalInstrument,'BTCUSD');
assert.equal(w.windowSec,5);
assert.equal(w.startTimestampMs,base);
assert.equal(w.endTimestampMs,base+5000);
assert.equal(w.timing.boundary['5m'].atBoundary,true);
assert.equal(w.timing.timeIntegrity.status,'PASS');
assert.equal(w.timing.timeIntegrity.prospectiveEligible,true);
assert.equal(w.coverage.bookIntegrityCertifiedOnly,true);
assert.equal(w.coverage.bookEventCount,3);
assert.equal(w.coverage.tradeEventCount,1);
assert.equal(w.orderFlow.ofiCount,3);
assert.equal(w.trades.signedQtySum,0.5);
assert.equal(w.trades.signedNotionalSum,50);
assert.equal(w.semantics.providerTimeDefinesResearchWindow,true);
assert.equal(w.semantics.crossVenueComparabilityClaim,false);
assert.equal(w.semantics.predictionInputAuthorized,false);

const root=fs.mkdtempSync(path.join(os.tmpdir(),'voicetrader-v077-coinbase-windows-'));
const source=path.join(root,'derived','coinbase','microstructure','BTCUSD','2026','08','22','03.ndjson');
fs.mkdirSync(path.dirname(source),{recursive:true});
fs.writeFileSync(source,[book(base+100),trade(base+2500),book(base+4900)].map(JSON.stringify).join('\n')+'\n');
const state={schemaVersion:'coinbase-boundary-worker-state-v1',files:{},buckets:{},counts:{sourceEvents:0,windowsWritten:0,duplicatesSkipped:0,parseErrors:0,providerTimestampMissing:0}};
processOnce(root,state,base+120_000);
assert.equal(state.counts.sourceEvents,3);
assert.equal(state.counts.parseErrors,0);
assert.equal(state.counts.providerTimestampMissing,0);
assert.ok(state.counts.windowsWritten>=4);
const out5=path.join(root,'derived','coinbase','windows','BTCUSD','5s','2026','08','22','03.ndjson');
assert.equal(fs.existsSync(out5),true);
const stored=fs.readFileSync(out5,'utf8').trim().split(/\r?\n/).map(JSON.parse);
assert.equal(stored.length,1);
assert.equal(stored[0].windowId,w.windowId);
assert.equal(stored[0].timing.timeBasis,'PROVIDER_TIMESTAMP');
assert.equal(stored[0].runtimePolicy.googleCloudEnabled,false);

console.log('PASS v0.77 Coinbase provider-time boundary windows');
