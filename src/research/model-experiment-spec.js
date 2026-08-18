import {
  MODEL_EXPERIMENT_SPEC_VERSION,
  MODEL_EXPERIMENT_DATA_BRANCH,
  MODEL_EXPERIMENT_DATA_PATH,
  MODEL_EXPERIMENT_TEMPLATES,
  MODEL_FEATURE_SET_REGISTRY,
  MODEL_PREPROCESSING_REGISTRY,
  MODEL_TARGET_REGISTRY,
  MODEL_ALGORITHM_CONTRACT_REGISTRY,
  buildDefaultExperimentSplitPolicy,
} from './model-experiment-registry.js';

export const MODEL_EXPERIMENT_SPEC_CONTRACT_VERSION='model-experiment-spec-contract-0.3';
export const MODEL_EXPERIMENT_FROZEN_INPUT_GUARD='frozen-input-deep-freeze-v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const deepFreeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const item of Object.values(value))deepFreeze(item);}return value;};
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
const canonical=value=>JSON.stringify(stable(value));
const SHA40=/^[0-9a-f]{40}$/i;
const FORBIDDEN_FEATURE_TOKENS=['labels','future','outcome','evidence','exit','netreturn','grossreturn','forwardreturn','pnl','profit','mfe','mae'];

function semanticSpec(spec){const copy=clone(spec||{});delete copy.semanticFingerprint;return copy;}
function fnv1a64(text){let hash=0xcbf29ce484222325n;const prime=0x100000001b3n;for(let i=0;i<text.length;i++){hash^=BigInt(text.charCodeAt(i));hash=BigInt.asUintN(64,hash*prime);}return hash.toString(16).padStart(16,'0');}
export function fingerprintModelExperimentSpec(spec){return `fnv1a64:${fnv1a64(canonical(semanticSpec(spec)))}`;}

export function isSafeModelFeaturePath(path){const value=String(path||'');if(!value.startsWith('inputs.'))return false;const lower=value.toLowerCase();return !FORBIDDEN_FEATURE_TOKENS.some(token=>lower.split('.').some(part=>part.includes(token)));}
export function validateModelFeatureSet(featureSet){const errors=[];if(!featureSet?.id)errors.push('feature-set-id-missing');const paths=Array.isArray(featureSet?.paths)?featureSet.paths:[];if(!paths.length)errors.push('feature-paths-empty');if(new Set(paths).size!==paths.length)errors.push('duplicate-feature-path');for(const path of paths)if(!isSafeModelFeaturePath(path))errors.push(`unsafe-feature-path:${path}`);if(featureSet?.learnedSelection!==false)errors.push('learned-feature-selection-forbidden');return {pass:errors.length===0,errorCodes:errors};}

export function createModelExperimentDraft({experimentId,templateId,datasetCommit,datasetCutoffTime,codeCommit,hypothesis,stopConditions=['fails-mandatory-baseline','fails-preregistered-null-screen','data-integrity-failure']}={}){
  const template=MODEL_EXPERIMENT_TEMPLATES.find(item=>item.templateId===templateId);if(!template)throw new Error(`unknown-model-template:${templateId}`);const featureSet=MODEL_FEATURE_SET_REGISTRY[template.featureSetId];const preprocessing=MODEL_PREPROCESSING_REGISTRY[template.preprocessingId];if(!preprocessing)throw new Error(`unknown-model-preprocessing:${template.preprocessingId}`);return {
    specVersion:MODEL_EXPERIMENT_SPEC_VERSION,
    experimentId:String(experimentId||''),
    revision:1,
    status:'DRAFT',
    createdAt:new Date().toISOString(),
    frozenAt:null,
    hypothesis:String(hypothesis||''),
    stopConditions:[...stopConditions],
    dataset:{schemaVersion:'prospective-experience-dataset-0.1',branch:MODEL_EXPERIMENT_DATA_BRANCH,path:MODEL_EXPERIMENT_DATA_PATH,commitSha:String(datasetCommit||''),cutoffTime:Number(datasetCutoffTime)},
    scope:{instruments:[...template.instrumentScope]},
    target:{...clone(MODEL_TARGET_REGISTRY[template.targetId])},
    featureSet:{id:featureSet.id,paths:[...featureSet.paths],learnedSelection:false},
    preprocessing:clone(preprocessing),
    algorithm:{id:template.algorithmId,provider:MODEL_ALGORITHM_CONTRACT_REGISTRY[template.algorithmId]?.provider||'unresolved',hyperparameters:clone(template.defaultHyperparameters),hyperparameterSearch:false},
    split:buildDefaultExperimentSplitPolicy(),
    baselines:[...template.mandatoryBaselines],
    nullControls:[...template.mandatoryNulls],
    metrics:[...template.metrics],
    environment:{codeCommit:String(codeCommit||''),runtimeContractId:'future-approved-model-worker-v1',localNodeRequired:false,workerAdapterRequired:true},
    approval:{humanApproved:false,actor:null,approvedAt:null},
    governance:{researchOnly:true,outcomeDrivenSpecGeneration:false,featureSelectionFromOutcomes:false,preprocessingFromOutcomes:false,hyperparameterSearch:false,automaticTraining:false,automaticRetraining:false,automaticPromotion:false,newProspectiveConfirmationRequired:true,registryLaunchesJobs:false,usedByDecisionEngine:false},
    semanticFingerprint:null,
  };
}

export function validateModelExperimentSpec(spec,{requireFrozen=false}={}){
  const errors=[];if(spec?.specVersion!==MODEL_EXPERIMENT_SPEC_VERSION)errors.push('spec-version-mismatch');if(!/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(String(spec?.experimentId||'')))errors.push('experiment-id-invalid');if(!['DRAFT','FROZEN','RETIRED'].includes(spec?.status))errors.push('status-invalid');if(requireFrozen&&spec?.status!=='FROZEN')errors.push('spec-not-frozen');
  const dataset=spec?.dataset||{};if(dataset.schemaVersion!=='prospective-experience-dataset-0.1')errors.push('dataset-schema-mismatch');if(dataset.branch!==MODEL_EXPERIMENT_DATA_BRANCH)errors.push('dataset-branch-mismatch');if(dataset.path!==MODEL_EXPERIMENT_DATA_PATH)errors.push('dataset-path-mismatch');if(!SHA40.test(String(dataset.commitSha||'')))errors.push('dataset-commit-invalid');if(!Number.isFinite(Number(dataset.cutoffTime)))errors.push('dataset-cutoff-invalid');
  const instruments=Array.isArray(spec?.scope?.instruments)?spec.scope.instruments:[];if(!instruments.length)errors.push('instrument-scope-empty');for(const instrument of instruments)if(!['BTCUSD','ETHUSD'].includes(instrument))errors.push(`instrument-unsupported:${instrument}`);
  const target=MODEL_TARGET_REGISTRY[spec?.target?.id];if(!target)errors.push('target-unregistered');else if(canonical(spec.target)!==canonical(target))errors.push('target-contract-drift');
  const registeredFeature=MODEL_FEATURE_SET_REGISTRY[spec?.featureSet?.id];if(!registeredFeature)errors.push('feature-set-unregistered');else {const validation=validateModelFeatureSet(spec.featureSet);errors.push(...validation.errorCodes);if(canonical(spec.featureSet.paths)!==canonical([...registeredFeature.paths]))errors.push('feature-set-path-drift');for(const instrument of instruments)if(!registeredFeature.supportedInstruments.includes(instrument))errors.push(`feature-set-instrument-mismatch:${instrument}`);}
  const registeredPreprocessing=MODEL_PREPROCESSING_REGISTRY[spec?.preprocessing?.id];if(!registeredPreprocessing)errors.push('preprocessing-unregistered');else if(canonical(spec.preprocessing)!==canonical(registeredPreprocessing))errors.push('preprocessing-contract-drift');
  if(registeredPreprocessing){const categories=registeredPreprocessing.categorical?.categories||{},numeric=registeredPreprocessing.numeric||{};for(const [path,values] of Object.entries(categories)){if(!spec?.featureSet?.paths?.includes(path))errors.push(`preprocessing-category-path-not-feature:${path}`);if(!Array.isArray(values)||!values.length||new Set(values).size!==values.length)errors.push(`preprocessing-category-contract-invalid:${path}`);}if(numeric.fitPartition!=='train-only')errors.push('preprocessing-fit-partition-invalid');if(numeric.arithmetic!=='ieee754-binary64'||numeric.accumulationOrder!=='frozen-train-row-order'||numeric.varianceDefinition!=='population'||numeric.ddof!==0||numeric.statisticRoundDecimals!==12||numeric.transformRoundDecimals!==12||numeric.zeroVariancePolicy!=='emit-zero')errors.push('preprocessing-numeric-semantics-drift');if(registeredPreprocessing.partitionRowOrder!=='instrument-lexicographic-then-frozen-split-order')errors.push('preprocessing-row-order-drift');if(registeredPreprocessing.categorical?.fitCategories!==false||registeredPreprocessing.categorical?.encoding!=='fixed-one-hot'||registeredPreprocessing.categorical?.values?.off!==0||registeredPreprocessing.categorical?.values?.on!==1)errors.push('preprocessing-categorical-semantics-drift');if(registeredPreprocessing.leakageGuard?.fitValidation!==false||registeredPreprocessing.leakageGuard?.fitInternalTest!==false||registeredPreprocessing.leakageGuard?.targetAware!==false||registeredPreprocessing.leakageGuard?.outcomeAware!==false)errors.push('preprocessing-leakage-guard-drift');if(registeredPreprocessing.missingValuePolicy!=='reject'||registeredPreprocessing.unknownCategoryPolicy!=='reject')errors.push('preprocessing-fail-closed-policy-drift');}
  const algorithm=MODEL_ALGORITHM_CONTRACT_REGISTRY[spec?.algorithm?.id];if(!algorithm)errors.push('algorithm-unregistered');else {if(target&&algorithm.task!==target.task)errors.push('algorithm-target-task-mismatch');if(spec.algorithm.provider!==algorithm.provider)errors.push('algorithm-provider-drift');if(spec.algorithm.hyperparameterSearch!==false)errors.push('hyperparameter-search-forbidden');const keys=Object.keys(spec.algorithm.hyperparameters||{});for(const key of keys)if(!algorithm.hyperparameterKeys.includes(key))errors.push(`hyperparameter-not-allowed:${key}`);}
  if(canonical(spec?.split)!==canonical(buildDefaultExperimentSplitPolicy()))errors.push('split-policy-drift');if(!Array.isArray(spec?.baselines)||!spec.baselines.length)errors.push('baselines-required');if(!Array.isArray(spec?.nullControls)||!spec.nullControls.length)errors.push('null-controls-required');if(!Array.isArray(spec?.metrics)||!spec.metrics.length)errors.push('metrics-required');if(String(spec?.hypothesis||'').trim().length<10)errors.push('hypothesis-too-short');if(!Array.isArray(spec?.stopConditions)||!spec.stopConditions.length)errors.push('stop-conditions-required');
  if(!SHA40.test(String(spec?.environment?.codeCommit||'')))errors.push('code-commit-invalid');if(spec?.environment?.workerAdapterRequired!==true)errors.push('worker-adapter-required');
  const governance=spec?.governance||{};for(const [key,expected] of Object.entries({researchOnly:true,outcomeDrivenSpecGeneration:false,featureSelectionFromOutcomes:false,preprocessingFromOutcomes:false,hyperparameterSearch:false,automaticTraining:false,automaticRetraining:false,automaticPromotion:false,newProspectiveConfirmationRequired:true,registryLaunchesJobs:false,usedByDecisionEngine:false}))if(governance[key]!==expected)errors.push(`governance-drift:${key}`);
  if(spec?.status==='FROZEN'||requireFrozen){if(spec?.approval?.humanApproved!==true)errors.push('human-approval-required');if(!String(spec?.approval?.actor||'').trim())errors.push('approval-actor-required');if(!Date.parse(spec?.approval?.approvedAt||''))errors.push('approval-time-invalid');if(!Date.parse(spec?.frozenAt||''))errors.push('freeze-time-invalid');const expected=fingerprintModelExperimentSpec(spec);if(spec?.semanticFingerprint!==expected)errors.push('fingerprint-mismatch');}
  return {version:'model-experiment-spec-validation-0.3',pass:errors.length===0,errorCount:errors.length,errorCodes:[...new Set(errors)]};
}

export function freezeModelExperimentSpec(draft,{actor,approvedAt=new Date().toISOString()}={}){
  const pre=validateModelExperimentSpec(draft);if(!pre.pass)throw new Error(`invalid-model-experiment-draft:${pre.errorCodes.join(',')}`);if(draft.status!=='DRAFT')throw new Error('only-draft-spec-can-freeze');const frozen={...clone(draft),status:'FROZEN',frozenAt:approvedAt,approval:{humanApproved:true,actor:String(actor||''),approvedAt},semanticFingerprint:null};if(!frozen.approval.actor.trim())throw new Error('human-approval-actor-required');frozen.semanticFingerprint=fingerprintModelExperimentSpec(frozen);const validation=validateModelExperimentSpec(frozen,{requireFrozen:true});if(!validation.pass)throw new Error(`frozen-spec-validation-failed:${validation.errorCodes.join(',')}`);return deepFreeze(frozen);}

export function compareFrozenModelExperimentSpecs(existing,incoming){const a=validateModelExperimentSpec(existing,{requireFrozen:true}),b=validateModelExperimentSpec(incoming,{requireFrozen:true});if(!a.pass||!b.pass)return {same:false,status:'invalid',errors:[...a.errorCodes,...b.errorCodes]};const same=existing.experimentId===incoming.experimentId&&existing.revision===incoming.revision&&existing.semanticFingerprint===incoming.semanticFingerprint&&canonical(semanticSpec(existing))===canonical(semanticSpec(incoming));return {same,status:same?'identical':'mutation-detected',existingFingerprint:existing.semanticFingerprint,incomingFingerprint:incoming.semanticFingerprint};}

export function evaluateModelExperimentWorkerEligibility({spec,readiness}={}){const validation=validateModelExperimentSpec(spec,{requireFrozen:true});const instruments=spec?.scope?.instruments||[];const requiresCrossMarket=instruments.includes('ETHUSD');const dataReady=requiresCrossMarket?readiness?.gates?.crossMarketResearchModelReady===true:readiness?.gates?.btcResearchModelReady===true;const eligible=validation.pass&&dataReady&&spec?.approval?.humanApproved===true;return {version:'model-experiment-worker-eligibility-0.3',eligibleForApprovedWorker:eligible,specValid:validation.pass,dataReady,humanApproved:spec?.approval?.humanApproved===true,readinessGate:requiresCrossMarket?'cross-market':'btc',registryLaunchesJobs:false,trainingImplemented:false,automaticTraining:false,automaticPromotion:false,reasons:[...(!validation.pass?validation.errorCodes:[]),...(!dataReady?['learning-readiness-gate-not-ready']:[]),...(spec?.approval?.humanApproved!==true?['human-approval-missing']:[])]};}
