import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {buildPreregisteredCrossVenueObservation} from '../src/short-horizon/cross-venue-preregistered-hypothesis.js';
import {processOnce} from './local-node/cross-venue-preregistered-worker.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'voicetrader-v079-preregistered-worker-'));
const base=Date.UTC(2026,7,22,6,0,0);
const b=[{name:'5m',atBoundary:true,secondsSinceBoundary:0,secondsToBoundary:0},{name:'15m',atBoundary:true,secondsSinceBoundary:0,secondsToBoundary:0},{name:'60m',atBoundary:false,secondsSinceBoundary:0,secondsToBoundary:3600}];
const metrics=[{name:'OFI_NORMALIZED',available:true,krakenSign:1,coinbaseSign:1,signAgreement:true,bothDirectional:true},{name:'DEPTH_IMBALANCE',available:true,krakenSign:1,coinbaseSign:1,signAgreement:true,bothDirectional:true},{name:'MICROPRICE_DELTA',available:true,krakenSign:1,coinbaseSign:1,signAgreement:true,bothDirectional:true},{name:'TAKER_FLOW',available:true,krakenSign:-1,coinbaseSign:-1,signAgreement:true,bothDirectional:true}];
const makePair=(start,i)=>({schemaVersion:'voicetrader-cross-venue-replication-v1',pairId:`worker-pair-${i}`,canonicalInstrument:'BTCUSD',windowSec:5,startTimestampMs:start,endTimestampMs:start+5000,eligibility:{descriptiveEligible:true,boundaryAligned:true},boundary:{kraken:b,coinbase:b},metrics,replication:{signAgreementRate:1,directionalSignAgreementRate:1}});
let blindPair=null,learningPair=null;
for(let i=0;i<200&&(blindPair==null||learningPair==null);i++){
  const p=makePair(base+i*5000,i),o=buildPreregisteredCrossVenueObservation(p,{generatedAtMs:p.endTimestampMs+1});
  if(o.evaluationPartition.role==='BLIND_EXAM')blindPair??=p;else learningPair??=p;
}
assert.ok(blindPair);assert.ok(learningPair);
const source=path.join(root,'derived','cross-venue','replication','BTCUSD','5s','2026','08','22','06.ndjson');fs.mkdirSync(path.dirname(source),{recursive:true});fs.writeFileSync(source,[blindPair,learningPair].map(JSON.stringify).join('\n')+'\n');
const fresh=()=>({schemaVersion:'voicetrader-cross-venue-preregistered-worker-state-v1',files:{},counts:{pairsRead:0,learningFullWritten:0,blindSealedWritten:0,outOfScopeWritten:0,ineligibleWritten:0,duplicatesSkipped:0,parseErrors:0}});
const state=fresh();processOnce(root,state,base+1_000_000);
assert.equal(state.counts.pairsRead,2);assert.equal(state.counts.learningFullWritten,1);assert.equal(state.counts.blindSealedWritten,1);assert.equal(state.counts.parseErrors,0);assert.equal(state.governance.blindResultsPersistedByThisWorker,false);assert.equal(state.governance.blindResultsAggregatedByThisWorker,false);assert.equal(state.governance.predictionInputAuthorized,false);
function allRows(dir){const out=[];const walk=(d)=>{if(!fs.existsSync(d))return;for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&e.name.endsWith('.ndjson'))for(const line of fs.readFileSync(p,'utf8').trim().split(/\r?\n/).filter(Boolean))out.push(JSON.parse(line));}};walk(dir);return out;}
const learning=allRows(path.join(root,'derived','cross-venue','preregistered','learning'));const blind=allRows(path.join(root,'derived','cross-venue','preregistered','blind-sealed'));
assert.equal(learning.length,1);assert.equal(blind.length,1);assert.ok(learning[0].venueDecisions);assert.ok(learning[0].replication);assert.equal(blind[0].evaluationPartition.role,'BLIND_EXAM');assert.equal(blind[0].venueDecisions,null);assert.equal(blind[0].replication,null);assert.equal(blind[0].blindState.status,'SEALED');assert.equal(blind[0].blindState.resultExposed,false);
const replay=fresh();processOnce(root,replay,base+1_100_000);assert.equal(replay.counts.duplicatesSkipped,2);assert.equal(allRows(path.join(root,'derived','cross-venue','preregistered','learning')).length,1);assert.equal(allRows(path.join(root,'derived','cross-venue','preregistered','blind-sealed')).length,1);
console.log('PASS v0.79 blind-safe preregistered worker');
