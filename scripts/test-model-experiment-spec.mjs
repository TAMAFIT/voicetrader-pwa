import assert from 'node:assert/strict';
import { MODEL_EXPERIMENT_REGISTRY, MODEL_FEATURE_SET_REGISTRY, MODEL_EXPERIMENT_TEMPLATES } from '../src/research/model-experiment-registry.js';
import {
  createModelExperimentDraft,
  validateModelExperimentSpec,
  validateModelFeatureSet,
  isSafeModelFeaturePath,
  fingerprintModelExperimentSpec,
  freezeModelExperimentSpec,
  compareFrozenModelExperimentSpecs,
  evaluateModelExperimentWorkerEligibility,
} from '../src/research/model-experiment-spec.js';

for(const featureSet of Object.values(MODEL_FEATURE_SET_REGISTRY)){const v=validateModelFeatureSet(featureSet);assert.equal(v.pass,true,`${featureSet.id}: ${v.errorCodes.join(',')}`);assert.ok(featureSet.paths.every(isSafeModelFeaturePath));assert.equal(featureSet.learnedSelection,false);}
for(const unsafe of ['labels.3.direction','inputs.labels.3.direction','inputs.future.return','inputs.completedEvidence.netReturnBps','inputs.trade.exitPrice','marketAtDecision.c'])assert.equal(isSafeModelFeaturePath(unsafe),false,`unsafe path accepted: ${unsafe}`);
assert.equal(MODEL_EXPERIMENT_REGISTRY.frozenSpecs.length,0);assert.equal(MODEL_EXPERIMENT_REGISTRY.governance.trainingImplemented,false);assert.equal(MODEL_EXPERIMENT_REGISTRY.governance.registryLaunchesJobs,false);assert.ok(MODEL_EXPERIMENT_TEMPLATES.every(item=>item.executable===false));

const draft=createModelExperimentDraft({experimentId:'btc-dir-001',templateId:'btc-direction-baseline-template-v1',datasetCommit:'a'.repeat(40),datasetCutoffTime:1788000000,codeCommit:'b'.repeat(40),hypothesis:'Frozen BTC decision-time context may contain incremental 3-bar directional information beyond mandatory baselines.'});draft.createdAt='2026-11-17T00:00:00Z';const draftValidation=validateModelExperimentSpec(draft);assert.equal(draftValidation.pass,true,JSON.stringify(draftValidation.errorCodes));assert.equal(draft.approval.humanApproved,false);assert.equal(draft.governance.automaticTraining,false);assert.equal(draft.algorithm.hyperparameterSearch,false);
const fp1=fingerprintModelExperimentSpec(draft),fp2=fingerprintModelExperimentSpec(structuredClone(draft));assert.equal(fp1,fp2,'fingerprint must be deterministic');assert.match(fp1,/^fnv1a64:[0-9a-f]{16}$/);
const frozen=freezeModelExperimentSpec(draft,{actor:'human-reviewer',approvedAt:'2026-11-17T01:00:00Z'});const frozenValidation=validateModelExperimentSpec(frozen,{requireFrozen:true});assert.equal(frozenValidation.pass,true,JSON.stringify(frozenValidation.errorCodes));assert.equal(frozen.status,'FROZEN');assert.equal(frozen.approval.humanApproved,true);assert.equal(frozen.semanticFingerprint,fingerprintModelExperimentSpec(frozen));assert.equal(compareFrozenModelExperimentSpecs(frozen,structuredClone(frozen)).status,'identical');

const mutated=structuredClone(frozen);mutated.hypothesis+=' Outcome-driven mutation.';const mutatedValidation=validateModelExperimentSpec(mutated,{requireFrozen:true});assert.equal(mutatedValidation.pass,false);assert.ok(mutatedValidation.errorCodes.includes('fingerprint-mismatch'));assert.equal(compareFrozenModelExperimentSpecs(frozen,mutated).same,false);
const leak=structuredClone(draft);leak.featureSet.paths[0]='inputs.labels.3.direction';const leakValidation=validateModelExperimentSpec(leak);assert.equal(leakValidation.pass,false);assert.ok(leakValidation.errorCodes.some(code=>code.startsWith('unsafe-feature-path:')));assert.ok(leakValidation.errorCodes.includes('feature-set-path-drift'));
const search=structuredClone(draft);search.algorithm.hyperparameterSearch=true;assert.ok(validateModelExperimentSpec(search).errorCodes.includes('hyperparameter-search-forbidden'));
const splitDrift=structuredClone(draft);splitDrift.split.shuffle=true;assert.ok(validateModelExperimentSpec(splitDrift).errorCodes.includes('split-policy-drift'));
const unapproved=structuredClone(draft);unapproved.status='FROZEN';unapproved.frozenAt='2026-11-17T01:00:00Z';unapproved.semanticFingerprint=fingerprintModelExperimentSpec(unapproved);const unapprovedValidation=validateModelExperimentSpec(unapproved,{requireFrozen:true});assert.ok(unapprovedValidation.errorCodes.includes('human-approval-required'));

const notReady=evaluateModelExperimentWorkerEligibility({spec:frozen,readiness:{gates:{btcResearchModelReady:false,crossMarketResearchModelReady:false}}});assert.equal(notReady.eligibleForApprovedWorker,false);assert.ok(notReady.reasons.includes('learning-readiness-gate-not-ready'));assert.equal(notReady.registryLaunchesJobs,false);assert.equal(notReady.trainingImplemented,false);
const ready=evaluateModelExperimentWorkerEligibility({spec:frozen,readiness:{gates:{btcResearchModelReady:true,crossMarketResearchModelReady:false}}});assert.equal(ready.eligibleForApprovedWorker,true);assert.equal(ready.registryLaunchesJobs,false);assert.equal(ready.trainingImplemented,false);assert.equal(ready.automaticTraining,false);assert.equal(ready.automaticPromotion,false);
console.log('Model Experiment Spec Registry v0.27 regression tests passed.');
