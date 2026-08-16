import assert from 'node:assert/strict';
import {
  FOUR_HOURS_SECONDS,
  FROZEN_KNOWLEDGE_EVALUATOR_COMMIT,
  emptyKnowledgeForwardRemoteDocument,
  fetchKnowledgeForwardRemoteDocument,
  mergeKnowledgeForwardEvidenceArchives,
  mergeKnowledgeForwardMarketBars,
  normalizeKrakenSpot4H,
} from '../src/research/knowledge-forward-remote.js';
import { collectKnowledgeForwardAutonomously } from '../src/research/autonomous-knowledge-forward-collector.js';
import { KNOWLEDGE_FORWARD_FREEZE_UNIX } from '../src/research/knowledge-forward-epoch.js';

function makeBars(count=270) {
  const bars=[];
  let price=30000;
  const start=KNOWLEDGE_FORWARD_FREEZE_UNIX-205*FOUR_HOURS_SECONDS;
  for(let i=0;i<count;i++){
    const drift=i<85?.0018:i<150?-.00115:i<220?.00135:.0019;
    const cycle=Math.sin(i/8)*.0016;
    const shock=i%67===0?.009:i%83===0?-.008:0;
    const ret=drift+cycle+shock;
    const o=price,c=Math.max(100,price*(1+ret));
    const h=Math.max(o,c)*(1+.004+Math.abs(Math.sin(i/6))*.002);
    const l=Math.min(o,c)*(1-.004-Math.abs(Math.cos(i/7))*.002);
    const volume=120+(i%19)*10+(i%47===0?350:0)+Math.abs(ret)*11000;
    bars.push({t:start+i*FOUR_HOURS_SECONDS,o,h,l,c,volume,trades:50+(i%13)});
    price=c;
  }
  return bars;
}

function payloadFromBars(bars) {
  return {error:[],result:{XXBTZUSD:bars.map(b=>[b.t,String(b.o),String(b.h),String(b.l),String(b.c),String((b.o+b.c)/2),String(b.volume),b.trades]),last:bars.at(-1)?.t||0}};
}

function response(payload,status=200) {
  return {ok:status>=200&&status<300,status,async json(){return payload;}};
}

const all=makeBars();
const last=all.at(-1);
const nowSeconds=last.t+60*60;
const normalized=normalizeKrakenSpot4H(payloadFromBars(all),nowSeconds);
assert.equal(normalized.length,all.length-1,'currently open Kraken candle must be excluded');
assert.equal(normalized.at(-1).t,all.at(-2).t);
assert.ok(normalized.every((bar,i)=>i===0||bar.t>normalized[i-1].t));

const fetch1=async()=>response(payloadFromBars(all));
const first=await collectKnowledgeForwardAutonomously({
  existingDocument:emptyKnowledgeForwardRemoteDocument(),fetchImpl:fetch1,nowSeconds,
  runAtIso:'2026-08-17T04:05:00Z',workflowRunId:'100',workflowRunAttempt:'1',
});
assert.equal(first.document.frozenEvaluatorCommit,FROZEN_KNOWLEDGE_EVALUATOR_COMMIT);
assert.equal(first.document.collector.browserRequired,false);
assert.equal(first.document.collector.paidApiRequired,false);
assert.equal(first.document.collector.marketConflicts.length,0);
assert.equal(first.document.market.bars.length,all.length-1);
assert.ok(first.document.evidenceArchive.decisions.length>0,'collector should archive prospective decision observations');
assert.equal(first.document.market.continuity.gapCount,0);
assert.equal(first.document.collector.evaluatorCommit,FROZEN_KNOWLEDGE_EVALUATOR_COMMIT);

const retainedCount=first.document.market.bars.length;
const nextBase={...all.at(-1),t:all.at(-1).t+FOUR_HOURS_SECONDS};
const nextClose=nextBase.c*1.003;
const next={...nextBase,o:all.at(-1).c,c:nextClose,h:Math.max(all.at(-1).c,nextClose)*1.004,l:Math.min(all.at(-1).c,nextClose)*.996,volume:222,trades:77};
const rolling=[...all.slice(-90),next];
const now2=next.t+FOUR_HOURS_SECONDS+1;
const second=await collectKnowledgeForwardAutonomously({
  existingDocument:first.document,fetchImpl:async()=>response(payloadFromBars(rolling)),nowSeconds:now2,
  runAtIso:'2026-08-17T08:05:00Z',workflowRunId:'101',workflowRunAttempt:'1',
});
assert.ok(second.document.market.bars.length>retainedCount,'durable market archive must retain old bars while appending new bars from a rolling Kraken window');
assert.equal(second.document.market.bars[0].t,first.document.market.bars[0].t,'old pre-freeze/history context must be retained');
assert.ok(second.document.evidenceArchive.decisions.length>=first.document.evidenceArchive.decisions.length,'evidence archive must be monotonic under normal catch-up');

const overlap=mergeKnowledgeForwardMarketBars(first.document.market.bars,first.document.market.bars.slice(-5));
assert.equal(overlap.added,0);
assert.equal(overlap.conflicts.length,0);
const badIncoming=first.document.market.bars.slice(-3).map(x=>({...x}));
badIncoming[0].c*=1.02;
const conflict=mergeKnowledgeForwardMarketBars(first.document.market.bars,badIncoming);
assert.equal(conflict.conflicts.length,1,'same timestamp with changed OHLC must be flagged rather than silently overwritten');
await assert.rejects(
  collectKnowledgeForwardAutonomously({existingDocument:first.document,fetchImpl:async()=>response(payloadFromBars(badIncoming)),nowSeconds:badIncoming.at(-1).t+FOUR_HOURS_SECONDS+1}),
  /market-bar-conflict/,
);

const mismatched={...first.document,frozenEvaluatorCommit:'deadbeef'};
await assert.rejects(
  collectKnowledgeForwardAutonomously({existingDocument:mismatched,fetchImpl:fetch1,nowSeconds}),
  /evaluator mismatch/,
);

const remoteArchive={...first.document.evidenceArchive,decisions:[{decisionKey:'d1',sourceId:'candidate-wave1-reference',candleTime:1,details:{nested:{score:1}}}],evidence:[]};
const localArchive={...first.document.evidenceArchive,decisions:[{decisionKey:'d1',sourceId:'candidate-wave1-reference',candleTime:1,details:{nested:{score:2}}},{decisionKey:'d2',sourceId:'candidate-wave1-reference',candleTime:2}],evidence:[]};
const mergedEvidence=mergeKnowledgeForwardEvidenceArchives(remoteArchive,localArchive);
assert.equal(mergedEvidence.conflicts.length,1,'nested content mismatch must be detected');
assert.equal(mergedEvidence.archive.decisions.length,2,'local unique records may supplement remote authoritative archive');
assert.equal(mergedEvidence.archive.decisions.find(x=>x.decisionKey==='d1').details.nested.score,1,'remote record must remain authoritative on conflict');

const remoteOk=await fetchKnowledgeForwardRemoteDocument({fetchImpl:async()=>response(first.document),timeoutMs:1000});
assert.ok(remoteOk.document);
assert.equal(remoteOk.error,null);
const remoteBad=await fetchKnowledgeForwardRemoteDocument({fetchImpl:async()=>response({...first.document,frozenEvaluatorCommit:'wrong'}),timeoutMs:1000});
assert.equal(remoteBad.document,null);
assert.match(remoteBad.error,/evaluator commit mismatch/);

console.log('Autonomous Knowledge Forward Collector v0.16 regression tests passed.');
