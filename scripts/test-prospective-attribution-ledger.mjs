import assert from 'node:assert/strict';
import { KNOWLEDGE_FORWARD_FREEZE_UNIX } from '../src/research/knowledge-forward-epoch.js';
import { HIGHER_TIMEFRAME_FORWARD_FREEZE_UNIX } from '../src/research/higher-timeframe-forward-epoch.js';
import { runKnowledgeForwardSnapshot } from '../src/research/knowledge-forward-runner.js';
import { runHigherTimeframeForwardSnapshot } from '../src/research/higher-timeframe-forward-runner.js';
import { buildKnowledgeProspectiveAttributionSnapshot } from '../src/research/knowledge-prospective-attribution.js';
import { buildHigherTimeframeProspectiveAttributionSnapshot } from '../src/research/higher-timeframe-prospective-attribution.js';
import {
  emptyProspectiveAttributionLedger,
  mergeProspectiveAttributionLedger,
  auditProspectiveAttributionLedger,
} from '../src/research/prospective-attribution-ledger.js';
import { collectKnowledgeForwardAutonomously } from '../src/research/autonomous-knowledge-forward-collector.js';
import { collectHigherTimeframeForwardAutonomously } from '../src/research/autonomous-higher-timeframe-forward-collector.js';
import { emptyKnowledgeForwardRemoteDocument } from '../src/research/knowledge-forward-remote.js';
import { emptyHigherTimeframeForwardRemoteDocument } from '../src/research/higher-timeframe-forward-remote.js';

const H=4*60*60;const freeze=Math.max(KNOWLEDGE_FORWARD_FREEZE_UNIX,HIGHER_TIMEFRAME_FORWARD_FREEZE_UNIX);const nextAligned=Math.floor(freeze/H)*H+H;const start=nextAligned-610*H;const series=[];let price=42000;
for(let i=0;i<640;i++){const phase=i<180?.0011:i<360?-.0008:.00135;const cycle=Math.sin(i/8)*.0021+Math.cos(i/21)*.0011;const shock=i%73===0?.012:i%97===0?-.01:0;const ret=phase+cycle+shock;const o=price,c=Math.max(5000,o*(1+ret));series.push({t:start+i*H,o,h:Math.max(o,c)*(1.0035+(i%9)*.0001),l:Math.min(o,c)*(0.9965-(i%7)*.0001),c,volume:130+(i%29)*11+(i%61===0?350:0),trades:60+i%31});price=c;}
const sourceBefore=JSON.stringify(series);
const kRunBefore=runKnowledgeForwardSnapshot({series,dataSignature:'attrib-test'});const hRunBefore=runHigherTimeframeForwardSnapshot({series,dataSignature:'attrib-test'});assert.equal(kRunBefore.status,'complete');assert.equal(hRunBefore.status,'complete');assert.ok(kRunBefore.observedBarTimes.length>0);assert.ok(hRunBefore.observedBarTimes.length>0);

const kSnapshot=buildKnowledgeProspectiveAttributionSnapshot({series,observedBarTimes:kRunBefore.observedBarTimes});assert.equal(kSnapshot.records.length,kRunBefore.observedBarTimes.length);assert.ok(kSnapshot.records.every(r=>r.futureOutcomeUsed===false&&r.observedProspectively===true));assert.ok(kSnapshot.records.every(r=>r.wave1.experts.length===15));assert.ok(kSnapshot.records.every(r=>r.wave2.playbooks.length===12&&r.wave2.gates.length===1));
const hSnapshot=buildHigherTimeframeProspectiveAttributionSnapshot({series,observedBarTimes:hRunBefore.observedBarTimes});assert.equal(hSnapshot.records.length,hRunBefore.observedBarTimes.length);assert.ok(hSnapshot.records.every(r=>r.higherTimeframe.components.length===6));
assert.equal(JSON.stringify(series),sourceBefore,'attribution mutated market series');
assert.deepEqual(runKnowledgeForwardSnapshot({series,dataSignature:'attrib-test'}),kRunBefore,'knowledge decisions changed after attribution replay');assert.deepEqual(runHigherTimeframeForwardSnapshot({series,dataSignature:'attrib-test'}),hRunBefore,'HTF decisions changed after attribution replay');

let kLedger=mergeProspectiveAttributionLedger(emptyProspectiveAttributionLedger('knowledge-forward-001'),kSnapshot,{epochId:'knowledge-forward-001',updatedAt:'2026-08-17T13:00:00Z'});assert.equal(kLedger.mergeConflicts.length,0);kLedger=mergeProspectiveAttributionLedger(kLedger,kSnapshot,{epochId:'knowledge-forward-001',updatedAt:'2026-08-17T14:00:00Z'});assert.equal(kLedger.mergeConflicts.length,0);assert.equal(kLedger.records.length,kSnapshot.records.length);assert.equal(auditProspectiveAttributionLedger({ledger:kLedger,epochId:'knowledge-forward-001',observedBarTimes:kRunBefore.observedBarTimes}).pass,true);
const tampered=structuredClone(kSnapshot);tampered.records[0].wave1.experts[0].score=Number(tampered.records[0].wave1.experts[0].score||0)+9;const conflicted=mergeProspectiveAttributionLedger(kLedger,tampered,{epochId:'knowledge-forward-001'});assert.ok(conflicted.mergeConflicts.length>0,'semantic attribution tamper was not detected');
const missing=structuredClone(kLedger);missing.records.pop();assert.equal(auditProspectiveAttributionLedger({ledger:missing,epochId:'knowledge-forward-001',observedBarTimes:kRunBefore.observedBarTimes}).pass,false);

function payloadFromBars(bars){return {error:[],result:{XXBTZUSD:bars.map(bar=>[bar.t,String(bar.o),String(bar.h),String(bar.l),String(bar.c),String(bar.c),String(bar.volume),String(bar.trades)]),last:bars.at(-1).t}};}
const fetchImpl=async()=>({ok:true,status:200,json:async()=>payloadFromBars(series)});const nowSeconds=series.at(-1).t+H+1;
const kCollected=await collectKnowledgeForwardAutonomously({existingDocument:emptyKnowledgeForwardRemoteDocument(),fetchImpl,nowSeconds,runAtIso:'2026-08-17T13:23:00Z',workflowRunId:'22001',workflowRunAttempt:'1'});assert.equal(kCollected.attributionAudit.pass,true);assert.equal(kCollected.document.attributionLedger.records.length,kCollected.prospective.observedBarTimes.length);assert.equal(kCollected.document.collector.attributionLedgerRequired,true);
const hCollected=await collectHigherTimeframeForwardAutonomously({existingDocument:emptyHigherTimeframeForwardRemoteDocument(),fetchImpl,nowSeconds,runAtIso:'2026-08-17T13:23:00Z',workflowRunId:'22002',workflowRunAttempt:'1'});assert.equal(hCollected.attributionAudit.pass,true);assert.equal(hCollected.document.attributionLedger.records.length,hCollected.snapshot.observedBarTimes.length);assert.equal(hCollected.document.collector.attributionLedgerRequired,true);

console.log('Prospective Attribution Ledger v0.22 regression tests passed.');
