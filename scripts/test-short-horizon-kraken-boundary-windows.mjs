import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { boundaryContext, aggregateMicrostructureEvents } from '../src/short-horizon/kraken-boundary-windows.js';
import { processOnce } from './local-node/kraken-boundary-window-worker.mjs';

const boundary=boundaryContext(Date.parse('2026-08-22T00:05:00Z'));
assert.equal(boundary['5m'].atBoundary,true);
assert.equal(boundary['15m'].secondsSinceBoundary,300);

const base=Date.parse('2026-08-22T00:00:00Z');
const events=[
  {eventType:'BOOK',symbol:'BTC/USD',receivedTimestampMs:base+100,book:{mid:100,spreadBps:1,micropriceMinusMid:.1,ofi:2,top1Imbalance:.2,depthImbalance:.1,bidDepth:10,askDepth:10}},
  {eventType:'TRADE',symbol:'BTC/USD',receivedTimestampMs:base+200,trade:{takerSide:'BUY',qty:1,signedQty:1,signedNotional:100}},
  {eventType:'BOOK',symbol:'BTC/USD',receivedTimestampMs:base+900,book:{mid:101,spreadBps:2,micropriceMinusMid:.2,ofi:3,top1Imbalance:.3,depthImbalance:.2,bidDepth:11,askDepth:9}},
];
const rows=aggregateMicrostructureEvents(events,{windowSec:1,nowMs:base+2000});
assert.equal(rows.length,1);
assert.equal(rows[0].orderFlow.ofiSum,5);
assert.equal(rows[0].trades.signedQtySum,1);
assert.equal(rows[0].price.midReturnBps,100);
assert.equal(rows[0].semantics.predictionInputAuthorized,false);

const root=fs.mkdtempSync(path.join(os.tmpdir(),'vt-v054-'));
const sourceDir=path.join(root,'derived','kraken','microstructure','BTCUSD','2026','08','22');
fs.mkdirSync(sourceDir,{recursive:true});
fs.writeFileSync(path.join(sourceDir,'00.ndjson'),events.map((r)=>JSON.stringify(r)).join('\n')+'\n','utf8');
const state={schemaVersion:'kraken-boundary-worker-state-v1',files:{},buckets:{},counts:{sourceEvents:0,windowsWritten:0,duplicatesSkipped:0,parseErrors:0}};
processOnce(root,state,base+61_000);
assert.equal(state.counts.sourceEvents,3);
assert.equal(state.counts.windowsWritten,4);
processOnce(root,state,base+62_000);
assert.equal(state.counts.windowsWritten,4);
assert.equal(state.counts.duplicatesSkipped,0);
console.log('v0.54 boundary window tests PASS');
