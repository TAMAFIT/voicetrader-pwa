import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  emptyHigherTimeframeForwardArchive,
  mergeHigherTimeframeForwardArchive,
} from '../src/research/higher-timeframe-forward-store.js';

const knowledgeWorkflow=fs.readFileSync('.github/workflows/knowledge-forward-collector.yml','utf8');
const htfWorkflow=fs.readFileSync('.github/workflows/higher-timeframe-forward-collector.yml','utf8');

// Frozen evaluator pinning must target the exact dependency manifest. Broad directories make
// unrelated future files appear as frozen-evaluator drift and previously stopped collection.
assert.ok(knowledgeWorkflow.includes('src/knowledge/expert-library.js'));
assert.ok(knowledgeWorkflow.includes('src/research/playbook-shadow-runner.js'));
assert.ok(!knowledgeWorkflow.includes('            src/knowledge \\'));
assert.ok(!knowledgeWorkflow.includes('            src/engine \\'));
assert.ok(!htfWorkflow.includes('            src/engine \\'));

function decision(signature,decision='ENTER_LONG'){
  return {
    decisionKey:'htf-forward-001:champion-001:1786939200',epochId:'htf-forward-001',sourceId:'champion-001',role:'benchmark',barIndex:721,candleTime:1786939200,decision,dataSignature:signature,observedProspectively:true,usedFutureOutcomeAtDecision:false,details:{engineVersion:'0.4-fixed-experts-policy',rawAlphaScore:14.57,decisionScore:62.96,confidenceScore:65},
  };
}
function evidence(signature,netReturnBps=42.5){
  return {
    evidenceKey:'htf-forward-001:champion-001:1786939200:1786982400:LONG',epochId:'htf-forward-001',sourceId:'champion-001',role:'benchmark',decision:'ENTER_LONG',side:'LONG',entryIndex:721,exitIndex:724,entryTime:1786939200,exitTime:1786982400,holdingBars:3,estimatedRoundTripCostBps:10,costModelVersion:'research-cost-v0.1',costUsesEntryBarInformationOnly:true,dataSignature:signature,observedProspectively:true,futureOutcomeUsedByDecision:false,details:{engineVersion:'0.4-fixed-experts-policy'},entryPrice:63463,exitPrice:63800,grossReturnBps:52.5,netReturnBps,
  };
}
function snapshot(signature,{decisionValue='ENTER_LONG',netReturnBps=42.5}={}){
  return {status:'complete',dataSignature:signature,observedBarTimes:[1786939200],decisions:[decision(signature,decisionValue)],evidence:[evidence(signature,netReturnBps)]};
}

const first=mergeHigherTimeframeForwardArchive(emptyHigherTimeframeForwardArchive(),snapshot('archive:722'));
const futureAppend=mergeHigherTimeframeForwardArchive(first,snapshot('archive:723'));
assert.equal(futureAppend.mergeConflicts.length,0,'future archive growth must not conflict solely because dataSignature changed');
assert.equal(futureAppend.decisions.length,1);
assert.equal(futureAppend.evidence.length,1);
assert.ok(futureAppend.dataSignatures.includes('archive:723'));

const semanticDecisionTamper=mergeHigherTimeframeForwardArchive(first,snapshot('archive:723',{decisionValue:'ENTER_SHORT'}));
assert.equal(semanticDecisionTamper.mergeConflicts.length,1,'a changed trading decision must still fail closed');
assert.equal(semanticDecisionTamper.mergeConflicts[0].type,'decisionKey');

const semanticEvidenceTamper=mergeHigherTimeframeForwardArchive(first,snapshot('archive:723',{netReturnBps:-99}));
assert.equal(semanticEvidenceTamper.mergeConflicts.length,1,'changed trade economics must still fail closed');
assert.equal(semanticEvidenceTamper.mergeConflicts[0].type,'evidenceKey');

console.log('Prospective collector repair regression tests passed.');
