import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildLocalLabSummary,directorySizeBytes,summarizeHealth } from '../src/short-horizon/local-node-ops.js';
import { createConsoleServer } from './local-node/local-lab-console.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'vt-v060-'));fs.mkdirSync(path.join(root,'state'),{recursive:true});fs.mkdirSync(path.join(root,'raw'),{recursive:true});fs.writeFileSync(path.join(root,'raw','x.bin'),Buffer.alloc(1024));
const now=Date.now();fs.writeFileSync(path.join(root,'state','kraken-microstructure-health.json'),JSON.stringify({status:'RUNNING',updatedAtMs:now,counts:{messages:10,book:4,trade:3,checksumMatches:4,checksumMismatches:0,bookFeatures:4,tradeFeatures:3},integrity:{bookSynchronizationVerified:true},semantics:{ofiAvailable:true,micropriceAvailable:true}}));
const s=directorySizeBytes(path.join(root,'raw'));assert.equal(s.bytes,1024);assert.equal(s.files,1);
const h=summarizeHealth({id:'x',freshMs:1000},{status:'RUNNING',updatedAtMs:now-2000},now);assert.equal(h.state,'LAGGING');
const summary=buildLocalLabSummary(root,{nowMs:now});assert.equal(summary.market.kraken.messages,10);assert.equal(summary.market.kraken.ofiAvailable,true);assert.equal(summary.safety.googleCloudEnabled,false);assert.equal(summary.storage.sizes.raw.bytes,1024);
const {server,start}=createConsoleServer({rootDir:root,port:0});const addr=await start();try{const health=await fetch(`http://127.0.0.1:${addr.port}/api/health`).then((r)=>r.json());assert.equal(health.status,'ok');assert.equal(health.safety.googleCloudEnabled,false);const status=await fetch(`http://127.0.0.1:${addr.port}/api/status`).then((r)=>r.json());assert.equal(status.market.kraken.messages,10);const html=await fetch(`http://127.0.0.1:${addr.port}/`).then((r)=>r.text());assert.ok(html.includes('VoiceTrader Local Edge Lab'));}finally{await new Promise((resolve)=>server.close(resolve));}
console.log('v0.60 local ops/console tests PASS');
