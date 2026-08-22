import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { aggregateQuoteBucket, boundaryContext, buildDerivedPath } from '../src/short-horizon/local-node-gmo-derived.js';
import { runDerivedPass } from './local-node/gmo-quote-derived-worker.mjs';

function tick(ms,bid,ask,id,status='OPEN',lat=10) {
  return {
    capture:{ receivedTimestampMs:ms },
    quote:{
      quoteId:id,
      timing:{ receivedTimestampMs:ms, receiveMinusSourceMs:lat },
      quote:{
        bid, ask, mid:(bid+ask)/2,
        spreadPriceUnits:ask-bid,
        spreadBps:(ask-bid)/((ask+bid)/2)*10000,
        marketStatus:status,
      },
    },
  };
}

const base=Date.UTC(2026,7,24,0,5,0,0);
const record=aggregateQuoteBucket([
  tick(base+100,158.1,158.104,'a','OPEN',11),
  tick(base+300,158.102,158.106,'b','OPEN',12),
  tick(base+800,158.101,158.105,'c','OPEN',9),
],1000);
assert.equal(record.activity.quoteUpdates,3);
assert.equal(record.price.mid.open,158.102);
assert.equal(record.price.mid.high,158.104);
assert.equal(record.price.mid.low,158.102);
assert.equal(record.price.mid.close,158.103);
assert.equal(record.activity.midDirection.up,1);
assert.equal(record.activity.midDirection.down,1);
assert.equal(record.activity.midDirection.balance,0);
assert.equal(record.timing.boundaries.is5mBoundary,true);
assert.equal(record.semantics.quoteDirectionBalanceIsOfi,false);
assert.equal(record.semantics.orderBookObserved,false);
assert.equal(record.runtimePolicy.googleCloudEnabled,false);
assert.equal(record.runtimePolicy.externalNetworkRequired,false);
assert.match(buildDerivedPath('X:/XVoiceTraderData',1000,base),/quote-bars[\\/]1s/);
assert.equal(boundaryContext(Date.UTC(2026,7,24,0,4,59)).boundaries.secondsTo5mBoundary,1);

const root=fs.mkdtempSync(path.join(os.tmpdir(),'voicetrader-v050-'));
const rawDir=path.join(root,'raw','gmo-fx','USDJPY','2026','08','24');
fs.mkdirSync(rawDir,{recursive:true});
const rows=[
  tick(base+100,158.1,158.104,'a'),
  tick(base+1200,158.101,158.105,'b'),
  tick(base+5100,158.102,158.106,'c'),
];
fs.writeFileSync(path.join(rawDir,'00.ndjson'),rows.map(JSON.stringify).join('\n')+'\n');
const first=runDerivedPass({rootDir:root,nowMs:base+2*60_000,lookbackMinutes:2});
assert.equal(first.runtimePolicy.googleCloudEnabled,false);
assert.equal(first.semantics.quoteDirectionBalanceIsOfi,false);
assert.ok(first.lastPass.totals.appended >= 4);
const second=runDerivedPass({rootDir:root,nowMs:base+2*60_000,lookbackMinutes:2});
assert.equal(second.lastPass.totals.appended,0);
const minuteFile=path.join(root,'derived','gmo-fx','USDJPY','quote-bars','1m','2026','08','24','00.ndjson');
assert.ok(fs.existsSync(minuteFile));
const minuteRecord=JSON.parse(fs.readFileSync(minuteFile,'utf8').trim());
assert.equal(minuteRecord.activity.quoteUpdates,3);
assert.equal(minuteRecord.timing.boundaries.is5mBoundary,true);
assert.ok(fs.existsSync(path.join(root,'state','derived-gmo-health.json')));

console.log('PASS v0.50 Local Node derived features');
