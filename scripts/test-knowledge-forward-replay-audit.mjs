import assert from 'node:assert/strict';
import { KNOWLEDGE_FORWARD_FREEZE_UNIX } from '../src/research/knowledge-forward-epoch.js';
import { runKnowledgeForwardSnapshot } from '../src/research/knowledge-forward-runner.js';
import { emptyKnowledgeForwardArchive, mergeKnowledgeForwardArchive } from '../src/research/knowledge-forward-store.js';
import { emptyKnowledgeForwardRemoteDocument, FROZEN_KNOWLEDGE_EVALUATOR_COMMIT, FOUR_HOURS_SECONDS } from '../src/research/knowledge-forward-remote.js';
import { auditKnowledgeForwardRemoteDocument } from '../src/research/knowledge-forward-replay-audit.js';
import { evaluateAuditedChampionPromotionQualification } from '../src/research/champion-promotion-replay-gate.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const series=[];let price=31000;const startTime=KNOWLEDGE_FORWARD_FREEZE_UNIX-220*FOUR_HOURS_SECONDS;
for(let i=0;i<285;i++){
  const phase=i<90?.0018:i<160?-.00125:i<225?.00145:.0021;
  const cycle=Math.sin(i/8)*.0015;
  const shock=i%61===0?.009:i%79===0?-.008:0;
  const ret=phase+cycle+shock;
  const o=price,c=Math.max(100,price*(1+ret));
  const h=Math.max(o,c)*(1+.004+Math.abs(Math.sin(i/7))*.002);
  const l=Math.min(o,c)*(1-.004-Math.abs(Math.cos(i/6))*.002);
  const volume=130+(i%17)*11+(i%43===0?390:0)+Math.abs(ret)*12000;
  series.push({t:startTime+i*FOUR_HOURS_SECONDS,o,h,l,c,volume,trades:50+i%13});price=c;
}
const run=runKnowledgeForwardSnapshot({series,dataSignature:'replay-audit-clean'});
assert.equal(run.status,'complete');assert.ok(run.observedBarTimes.length>20);assert.ok(run.evidence.length>0);
const archive=mergeKnowledgeForwardArchive(emptyKnowledgeForwardArchive(),run,{updatedAt:'2026-08-18T00:00:00Z'});
const clean=emptyKnowledgeForwardRemoteDocument();
clean.market.bars=clone(series);clean.market.continuity={barCount:series.length,gapCount:0,missingBarTimes:[]};clean.market.closedBarCount=series.length;clean.market.firstBarTime=series[0].t;clean.market.lastBarTime=series.at(-1).t;clean.market.signature=`test:${series[0].t}:${series.at(-1).t}:${series.length}`;
clean.evidenceArchive=archive;clean.collector.status='success';clean.collector.lastRunAt='2026-08-18T00:23:00Z';clean.collector.sourceFetchedAt='2026-08-18T00:23:00Z';clean.collector.evaluatorCommit=FROZEN_KNOWLEDGE_EVALUATOR_COMMIT;clean.collector.marketConflicts=[];

const audit=auditKnowledgeForwardRemoteDocument(clean);
assert.equal(audit.status,'pass',JSON.stringify(audit.errors.slice(0,5)));
assert.equal(audit.pass,true);assert.equal(audit.errorCount,0);assert.equal(audit.methodology.fullMarketReplay,true);assert.equal(audit.methodology.evidenceCompletenessReplay,true);assert.equal(audit.methodology.changesFrozenDecisionEngine,false);

function expectFail(mutator,code){const doc=clone(clean);mutator(doc);const result=auditKnowledgeForwardRemoteDocument(doc);assert.equal(result.pass,false,`tamper should fail: ${code}`);assert.ok(result.errorCodes.includes(code),`expected ${code}, got ${result.errorCodes.join(', ')}`);return result;}
const firstEvidence=clean.evidenceArchive.evidence[0];
expectFail(doc=>{doc.evidenceArchive.evidence[0].entryPrice*=1.01;},'evidence-entry-price-mismatch');
expectFail(doc=>{doc.evidenceArchive.evidence[0].estimatedRoundTripCostBps+=1;},'evidence-cost-mismatch');
expectFail(doc=>{doc.evidenceArchive.evidence[0].netReturnBps+=3;},'evidence-net-bps-mismatch');
expectFail(doc=>{doc.evidenceArchive.evidence[0].side=doc.evidenceArchive.evidence[0].side==='LONG'?'SHORT':'LONG';},'evidence-key-mismatch');
expectFail(doc=>{doc.evidenceArchive.evidence[0].evidenceKey='tampered-key';},'evidence-key-mismatch');
expectFail(doc=>{const key=doc.evidenceArchive.evidence[0].evidenceKey;doc.evidenceArchive.evidence=doc.evidenceArchive.evidence.filter(item=>item.evidenceKey!==key);},'evidence-expected-record-missing');
expectFail(doc=>{doc.evidenceArchive.evidence.push(clone(doc.evidenceArchive.evidence[0]));},'evidence-source-overlap');
expectFail(doc=>{const source=firstEvidence.sourceId,time=firstEvidence.entryTime;doc.evidenceArchive.decisions=doc.evidenceArchive.decisions.filter(item=>!(item.sourceId===source&&item.candleTime===time));},'evidence-originating-decision-missing');
expectFail(doc=>{doc.evidenceArchive.evidence[0].futureOutcomeUsedByDecision=true;},'evidence-future-flag-invalid');
expectFail(doc=>{doc.evidenceArchive.decisions[0].usedFutureOutcomeAtDecision=true;},'decision-future-flag-invalid');
expectFail(doc=>{doc.market.bars.splice(50,1);},'market-4h-gap');

const gated=evaluateAuditedChampionPromotionQualification(clean);
assert.equal(gated.replayAudit.pass,true);assert.equal(gated.freshReplayAuditRequired,true);assert.equal(gated.promotionEligible,false);
const tampered=clone(clean);tampered.evidenceArchive.evidence[0].netReturnBps+=5;
const gatedTampered=evaluateAuditedChampionPromotionQualification(tampered);
assert.equal(gatedTampered.replayAudit.pass,false);assert.equal(gatedTampered.anyConfirmationReviewReady,false);assert.ok(gatedTampered.candidates.every(item=>item.blockers.includes('evidence-replay-audit-not-pass')));assert.ok(gatedTampered.candidates.every(item=>item.promotionEligible===false));

console.log('Knowledge Forward Evidence Replay Audit v0.18 tamper regression tests passed.');
