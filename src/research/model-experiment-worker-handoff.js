import { MODEL_ALGORITHM_CONTRACT_REGISTRY } from './model-experiment-registry.js';
import { validateModelExperimentSpec } from './model-experiment-spec.js';
import { buildChronologicalExperimentSplit, evaluateLearningReadiness } from './learning-readiness-protocol.js';
import { auditModelExperimentLifecycleDocument, MODEL_EXPERIMENT_LIFECYCLE_VERSION } from './model-experiment-lifecycle.js';

export const MODEL_WORKER_HANDOFF_VERSION='model-worker-handoff-0.1';
export const MODEL_WORKER_HANDOFF_MANIFEST_VERSION='model-worker-reproducibility-manifest-0.1';
export const MODEL_WORKER_HANDOFF_GOVERNANCE=Object.freeze({
  readOnly:true,
  requiresActiveFrozenSpec:true,
  requiresExactFrozenDataset:true,
  requiresExactFrozenCode:true,
  requiresLifecycleAuditPass:true,
  requiresLearningReadiness:true,
  requiresChronologicalSplit:true,
  requiresFeatureMaterialization:true,
  browserExecutionAuthority:false,
  executionAuthorized:false,
  launchesTrainingJobs:false,
  trainingImplemented:false,
  internalTestPromotionEvidence:false,
  futureProspectiveConfirmationRequired:true,
  usedByDecisionEngine:false,
});

const SHA40=/^[0-9a-f]{40}$/i;
const clone=value=>JSON.parse(JSON.stringify(value));
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
const canonical=value=>JSON.stringify(stable(value));
function fnv1a64(text){let hash=0xcbf29ce484222325n;const prime=0x100000001b3n;for(let i=0;i<text.length;i++){hash^=BigInt(text.charCodeAt(i));hash=BigInt.asUintN(64,hash*prime);}return hash.toString(16).padStart(16,'0');}
const fingerprint=value=>`fnv1a64:${fnv1a64(canonical(value))}`;
const keyOf=(experimentId,revision)=>`${experimentId}#${revision}`;
const readPath=(object,path)=>String(path||'').split('.').reduce((value,key)=>value==null?undefined:value[key],object);
const sha=value=>SHA40.test(String(value||''))?String(value).toLowerCase():null;

function activeFrozenState(audit,experimentId,revision){const matches=(audit?.effectiveStates||[]).filter(state=>state.experimentId===experimentId&&state.effectiveStatus==='FROZEN'&&(revision==null||Number(state.revision)===Number(revision)));return matches.length===1?matches[0]:null;}
function deriveFrozenCutoff(dataset,spec){const scope=new Set(spec?.scope?.instruments||[]),horizon=Number(spec?.target?.horizonBars),times=[];for(const row of dataset?.rows||[]){if(!scope.has(row.instrument))continue;const label=row.labels?.[horizon];if(label?.status!=='matured')continue;const available=Number(label.availableAtTime);if(Number.isFinite(available))times.push(available);}return times.length?Math.max(...times):null;}
function buildSplitSet(dataset,spec){const splits={};for(const instrument of spec.scope.instruments){splits[instrument]=buildChronologicalExperimentSplit(dataset,{instrument,cutoffTime:spec.dataset.cutoffTime,horizonBars:spec.target.horizonBars});}return splits;}
function assignedKeys(splits){const keys=[];for(const split of Object.values(splits)){for(const name of ['train','validation','internalTest'])for(const key of split?.partitions?.[name]?.experienceKeys||[])keys.push(key);}return keys;}
function partitionFingerprints(splits){const result={};for(const [instrument,split] of Object.entries(splits)){result[instrument]={};for(const name of ['train','validation','internalTest'])result[instrument][name]=fingerprint(split?.partitions?.[name]?.experienceKeys||[]);result[instrument].embargoFirst=fingerprint(split?.embargo?.first?.experienceKeys||[]);result[instrument].embargoSecond=fingerprint(split?.embargo?.second?.experienceKeys||[]);}return result;}
function outputColumns(spec){const categories=spec.preprocessing?.categorical?.categories||{},columns=[];for(const path of spec.featureSet.paths){const values=categories[path];if(values)for(const value of values)columns.push(`${path}==${value}`);else columns.push(path);}return columns;}

export function auditModelWorkerFeatureMaterialization({dataset,spec,splits}={}){
  const errors=[],rowsByKey=new Map((dataset?.rows||[]).map(row=>[row.experienceKey,row]));const categories=spec?.preprocessing?.categorical?.categories||{};const keys=assignedKeys(splits);let checkedValues=0;
  for(const key of keys){const row=rowsByKey.get(key);if(!row){errors.push(`split-row-missing:${key}`);continue;}for(const path of spec.featureSet.paths){const value=readPath(row,path),allowed=categories[path];checkedValues++;if(allowed){if(typeof value!=='string'||!allowed.includes(value))errors.push(`categorical-feature-invalid:${key}:${path}`);}else if(typeof value!=='number'||!Number.isFinite(value))errors.push(`numeric-feature-invalid:${key}:${path}`);}const target=readPath(row,spec.target.labelPath);if(spec.target.task==='classification'){if(!spec.target.classes.includes(target))errors.push(`target-class-invalid:${key}`);}else if(typeof target!=='number'||!Number.isFinite(target))errors.push(`target-value-invalid:${key}`);}
  return {version:'model-worker-feature-materialization-audit-0.1',pass:errors.length===0,errorCount:errors.length,errorCodes:[...new Set(errors)],checkedRows:keys.length,checkedFeatureValues:checkedValues,featureCount:spec?.featureSet?.paths?.length||0,outputColumnCount:outputColumns(spec).length};
}

export function evaluateModelWorkerHandoff({document,dataset,datasetCommit,codeCommit,lifecycleCommit,experimentId,revision=null,expectedSemanticFingerprint=null}={}){
  const blockers=[];const lifecycleSha=sha(lifecycleCommit),datasetSha=sha(datasetCommit),codeSha=sha(codeCommit);if(!lifecycleSha)blockers.push('lifecycle-commit-invalid');if(!datasetSha)blockers.push('dataset-commit-invalid');if(!codeSha)blockers.push('code-commit-invalid');if(document?.schemaVersion!==MODEL_EXPERIMENT_LIFECYCLE_VERSION)blockers.push('lifecycle-version-mismatch');
  const audit=auditModelExperimentLifecycleDocument(document||{});if(!audit.pass)blockers.push(...audit.errorCodes.map(code=>`lifecycle:${code}`));if(document?.audit?.pass!==true)blockers.push('persisted-lifecycle-audit-not-pass');const state=activeFrozenState(audit,experimentId,revision);if(!state)blockers.push('active-frozen-spec-not-found');const frozen=state?(document.frozenSpecs||[]).find(spec=>keyOf(spec.experimentId,spec.revision)===keyOf(state.experimentId,state.revision)):null;if(state&&!frozen)blockers.push('frozen-spec-snapshot-missing');
  const specValidation=frozen?validateModelExperimentSpec(frozen,{requireFrozen:true}):{pass:false,errorCodes:['frozen-spec-unavailable']};if(frozen&&!specValidation.pass)blockers.push(...specValidation.errorCodes.map(code=>`spec:${code}`));if(frozen&&state?.semanticFingerprint!==frozen.semanticFingerprint)blockers.push('lifecycle-frozen-fingerprint-drift');if(frozen&&expectedSemanticFingerprint&&String(expectedSemanticFingerprint)!==String(frozen.semanticFingerprint))blockers.push('expected-semantic-fingerprint-mismatch');
  if(dataset?.schemaVersion!=='prospective-experience-dataset-0.1'||dataset?.audit?.pass!==true||(dataset?.mergeConflicts||[]).length)blockers.push('prospective-dataset-audit-not-pass');if(frozen&&datasetSha&&datasetSha!==String(frozen.dataset.commitSha).toLowerCase())blockers.push('frozen-dataset-commit-mismatch');if(frozen&&codeSha&&codeSha!==String(frozen.environment.codeCommit).toLowerCase())blockers.push('frozen-code-commit-mismatch');
  const cutoff=frozen?deriveFrozenCutoff(dataset,frozen):null;if(frozen&&Number(cutoff)!==Number(frozen.dataset.cutoffTime))blockers.push('frozen-dataset-cutoff-drift');const readiness=evaluateLearningReadiness(dataset||{});let readinessGate=null,readinessReady=false;if(frozen){readinessGate=frozen.scope.instruments.includes('ETHUSD')?'cross-market':'btc';readinessReady=readinessGate==='cross-market'?readiness.gates.crossMarketResearchModelReady===true:readiness.gates.btcResearchModelReady===true;if(!readinessReady)blockers.push('learning-readiness-gate-not-ready');}
  const splits=frozen?buildSplitSet(dataset,frozen):{};for(const [instrument,split] of Object.entries(splits))if(split.status!=='complete')blockers.push(`chronological-split-not-complete:${instrument}:${split.reason||split.status}`);const materialization=frozen&&Object.values(splits).every(split=>split.status==='complete')?auditModelWorkerFeatureMaterialization({dataset,spec:frozen,splits}):{version:'model-worker-feature-materialization-audit-0.1',pass:false,errorCount:1,errorCodes:['split-unavailable'],checkedRows:0,checkedFeatureValues:0,featureCount:frozen?.featureSet?.paths?.length||0,outputColumnCount:frozen?outputColumns(frozen).length:0};if(frozen&&!materialization.pass)blockers.push(...materialization.errorCodes.map(code=>`materialization:${code}`));
  const algorithm=frozen?MODEL_ALGORITHM_CONTRACT_REGISTRY[frozen.algorithm.id]:null;const workerAdapterReady=algorithm?.installed===true;const reproducibilityReady=blockers.length===0;const executionBlockers=[...(!workerAdapterReady?['worker-adapter-not-installed']:[]),'execution-authority-not-implemented'];
  return {version:MODEL_WORKER_HANDOFF_VERSION,reproducibilityReady,workerAdapterReady,executionAuthorized:false,blockers:[...new Set(blockers)],executionBlockers,governance:{...MODEL_WORKER_HANDOFF_GOVERNANCE},frozenSpec:frozen?clone(frozen):null,lifecycleAudit:audit,readiness,readinessGate,derivedDatasetCutoff:cutoff,splits,partitionFingerprints:partitionFingerprints(splits),materialization,outputColumns:frozen?outputColumns(frozen):[],heads:{datasetCommit:datasetSha,codeCommit:codeSha,lifecycleCommit:lifecycleSha}};
}

export function buildModelWorkerHandoffManifest(input={}){
  const evaluation=evaluateModelWorkerHandoff(input);if(!evaluation.reproducibilityReady)throw new Error(`model-worker-handoff-blocked:${evaluation.blockers.join(',')}`);const spec=evaluation.frozenSpec;const manifest={version:MODEL_WORKER_HANDOFF_MANIFEST_VERSION,status:'REPRODUCIBILITY_READY_EXECUTION_BLOCKED',experiment:{experimentId:spec.experimentId,revision:spec.revision,semanticFingerprint:spec.semanticFingerprint},source:{dataset:{schemaVersion:spec.dataset.schemaVersion,branch:spec.dataset.branch,path:spec.dataset.path,commitSha:spec.dataset.commitSha,cutoffTime:spec.dataset.cutoffTime},codeCommit:spec.environment.codeCommit,lifecycleCommit:evaluation.heads.lifecycleCommit},target:clone(spec.target),featureSet:clone(spec.featureSet),preprocessing:clone(spec.preprocessing),outputColumns:[...evaluation.outputColumns],algorithm:{...clone(spec.algorithm),adapterInstalled:evaluation.workerAdapterReady},split:{policy:clone(spec.split),instruments:clone(evaluation.splits),partitionFingerprints:clone(evaluation.partitionFingerprints)},baselines:[...spec.baselines],nullControls:[...spec.nullControls],metrics:[...spec.metrics],stopConditions:[...spec.stopConditions],approval:clone(spec.approval),validation:{lifecycleAuditPass:evaluation.lifecycleAudit.pass,learningReadinessPass:true,featureMaterializationPass:evaluation.materialization.pass,derivedDatasetCutoff:evaluation.derivedDatasetCutoff},governance:{...MODEL_WORKER_HANDOFF_GOVERNANCE},execution:{workerAdapterReady:evaluation.workerAdapterReady,executionAuthorized:false,blockers:[...evaluation.executionBlockers]},manifestFingerprint:null};const semantic=clone(manifest);delete semantic.manifestFingerprint;manifest.manifestFingerprint=fingerprint(semantic);return Object.freeze(manifest);
}

export function fingerprintModelWorkerHandoffManifest(manifest){const semantic=clone(manifest||{});delete semantic.manifestFingerprint;return fingerprint(semantic);}
