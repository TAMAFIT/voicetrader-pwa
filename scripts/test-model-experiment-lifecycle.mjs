import assert from 'node:assert/strict';
import { createModelExperimentDraft, freezeModelExperimentSpec } from '../src/research/model-experiment-spec.js';
import {
  MODEL_EXPERIMENT_LIFECYCLE_GOVERNANCE,
  appendModelExperimentLifecycleEvent,
  auditModelExperimentLifecycleDocument,
  createDraftRegisteredEvent,
  createFrozenLifecycleEvent,
  createModelExperimentLifecycleDocument,
  createRetiredLifecycleEvent,
  fingerprintModelExperimentLifecycleEvent,
} from '../src/research/model-experiment-lifecycle.js';

const draft=createModelExperimentDraft({experimentId:'btc-dir-lifecycle-001',templateId:'btc-direction-baseline-template-v1',datasetCommit:'a'.repeat(40),datasetCutoffTime:1788000000,codeCommit:'b'.repeat(40),hypothesis:'Frozen decision-time inputs may provide incremental three-bar direction information beyond mandatory baselines.'});
draft.createdAt='2026-11-17T00:00:00Z';
let document=createModelExperimentLifecycleDocument({updatedAt:'2026-11-17T00:00:00Z'});
assert.equal(document.audit.pass,true);assert.deepEqual(document.audit.counts,{draft:0,frozen:0,retired:0});assert.equal(document.governance.trainingImplemented,false);assert.equal(document.governance.ledgerLaunchesJobs,false);assert.deepEqual(document.governance,MODEL_EXPERIMENT_LIFECYCLE_GOVERNANCE);

const draftEvent=createDraftRegisteredEvent(draft,{actor:'human-researcher',occurredAt:'2026-11-17T00:30:00Z'});
assert.equal(draftEvent.eventFingerprint,fingerprintModelExperimentLifecycleEvent(draftEvent));
document=appendModelExperimentLifecycleEvent(document,draftEvent);
assert.equal(document.audit.pass,true);assert.equal(document.audit.counts.draft,1);assert.equal(document.audit.effectiveStates[0].effectiveStatus,'DRAFT');

const frozen=freezeModelExperimentSpec(draft,{actor:'human-reviewer',approvedAt:'2026-11-17T01:00:00Z'});
const frozenSnapshot=structuredClone(frozen);const freezeEvent=createFrozenLifecycleEvent(frozen);
document=appendModelExperimentLifecycleEvent(document,freezeEvent,{frozenSpec:frozen});
assert.equal(document.audit.pass,true);assert.deepEqual(document.audit.counts,{draft:0,frozen:1,retired:0});assert.equal(document.audit.effectiveStates[0].effectiveStatus,'FROZEN');assert.deepEqual(document.frozenSpecs[0],frozenSnapshot);

const retireEvent=createRetiredLifecycleEvent(frozen,{actor:'human-reviewer',reason:'Superseded by a separately preregistered future experiment revision.',occurredAt:'2026-11-18T00:00:00Z'});
document=appendModelExperimentLifecycleEvent(document,retireEvent);
assert.equal(document.audit.pass,true);assert.deepEqual(document.audit.counts,{draft:0,frozen:0,retired:1});assert.equal(document.audit.effectiveStates[0].effectiveStatus,'RETIRED');assert.deepEqual(document.frozenSpecs[0],frozenSnapshot,'retirement must never mutate frozen spec snapshot');assert.equal(document.frozenSpecs[0].status,'FROZEN');

assert.throws(()=>appendModelExperimentLifecycleEvent(document,retireEvent),/lifecycle-append-rejected/,'duplicate retirement must fail');
assert.throws(()=>appendModelExperimentLifecycleEvent(document,freezeEvent,{frozenSpec:frozen}),/lifecycle-append-rejected|duplicate-frozen-spec/,'duplicate freeze must fail');

const noDraft=createModelExperimentLifecycleDocument({updatedAt:'2026-11-17T00:00:00Z'});
assert.throws(()=>appendModelExperimentLifecycleEvent(noDraft,freezeEvent,{frozenSpec:frozen}),/freeze-without-draft/);

const reordered=structuredClone(document);reordered.events=[reordered.events[1],reordered.events[0],reordered.events[2]];reordered.audit=auditModelExperimentLifecycleDocument(reordered);assert.equal(reordered.audit.pass,false);assert.ok(reordered.audit.errorCodes.some(code=>code.startsWith('event-order-invalid:')));

const drift=structuredClone(document);drift.frozenSpecs[0].dataset.commitSha='c'.repeat(40);drift.audit=auditModelExperimentLifecycleDocument(drift);assert.equal(drift.audit.pass,false);assert.ok(drift.audit.errorCodes.some(code=>code.includes('fingerprint-mismatch')||code.includes('freeze-dataset-drift')));

const eventDrift=structuredClone(document);eventDrift.events[1].datasetCommit='d'.repeat(40);eventDrift.audit=auditModelExperimentLifecycleDocument(eventDrift);assert.equal(eventDrift.audit.pass,false);assert.ok(eventDrift.audit.errorCodes.some(code=>code.startsWith('event-fingerprint-mismatch:')));assert.ok(eventDrift.audit.errorCodes.some(code=>code.startsWith('freeze-dataset-drift:')));

assert.throws(()=>createRetiredLifecycleEvent(frozen,{actor:'human-reviewer',reason:'short',occurredAt:'2026-11-18T00:00:00Z'}),/retire-reason-too-short/);
console.log('Model Experiment Lifecycle / Approval Ledger v0.28 regression tests passed.');
