import { validateModelExecutionEnvelope, fingerprintModelExecutionEnvelope, MODEL_EXECUTION_ENVELOPE_VERSION } from './model-execution-evidence-contract.js';

export const MODEL_ADAPTER_INTERFACE_VERSION='model-adapter-interface-0.1';
export const MODEL_ADAPTER_DESCRIPTOR_REGISTRY_VERSION='model-adapter-descriptor-registry-0.1';
export const MODEL_DEPENDENCY_LOCK_VERSION='model-dependency-lock-0.1';
export const MODEL_ENVIRONMENT_LOCK_VERSION='model-environment-lock-0.1';
export const MODEL_ADAPTER_PREPARATION_VERSION='model-adapter-preparation-0.1';
export const MODEL_ADAPTER_ENVIRONMENT_GOVERNANCE=Object.freeze({
  researchOnly:true,
  descriptorRegistryReadOnly:true,
  dependencyInstallationImplemented:false,
  modelImportsImplemented:false,
  modelAdapterInstalled:false,
  modelFitImplemented:false,
  modelPredictImplemented:false,
  modelEvaluationImplemented:false,
  executionAuthorized:false,
  launchesTrainingJobs:false,
  resultProducingWorkflow:false,
  browserExecutionAuthority:false,
  writesProspectiveExperience:false,
  writesLifecycle:false,
  writesEvidence:false,
  automaticRetraining:false,
  automaticPromotion:false,
});

const SHA40=/^[0-9a-f]{40}$/i;
const SHA256=/^sha256:[0-9a-f]{64}$/i;
const FINGERPRINT=/^fnv1a64:[0-9a-f]{16}$/;
const VERSION=/^[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:[-+][0-9A-Za-z.-]+)?$/;
const clone=value=>JSON.parse(JSON.stringify(value));
const deepFreeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const item of Object.values(value))deepFreeze(item);}return value;};
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
const canonical=value=>JSON.stringify(stable(value));
function fnv1a64(text){let hash=0xcbf29ce484222325n;const prime=0x100000001b3n;for(let i=0;i<text.length;i++){hash^=BigInt(text.charCodeAt(i));hash=BigInt.asUintN(64,hash*prime);}return hash.toString(16).padStart(16,'0');}
const fingerprint=value=>`fnv1a64:${fnv1a64(canonical(value))}`;

const descriptor=(value)=>deepFreeze({interfaceVersion:MODEL_ADAPTER_INTERFACE_VERSION,installed:false,adapterVersion:null,dependencyInstallationImplemented:false,modelImportsImplemented:false,implementedCapabilities:{fit:false,predict:false,predictProbability:false,evaluate:false},...value});
export const MODEL_ADAPTER_DESCRIPTOR_REGISTRY=deepFreeze({
  version:MODEL_ADAPTER_DESCRIPTOR_REGISTRY_VERSION,
  descriptors:{
    'sklearn-logistic-regression-l2':descriptor({adapterId:'python-sklearn-logistic-regression-l2-v1',algorithmId:'sklearn-logistic-regression-l2',provider:'future-python-worker',task:'classification',implementation:{language:'python',runtimeImplementation:'CPython',package:'scikit-learn',module:'sklearn.linear_model',className:'LogisticRegression'},requiredDependencies:['scikit-learn'],requiredCapabilities:{fit:true,predict:true,predictProbability:true,evaluate:true},hyperparameterMapping:{mode:'exact-frozen-keys',keys:['C','max_iter','class_weight','random_state']},deterministicSeedPolicy:{type:'frozen-hyperparameter',parameter:'random_state',required:true}}),
    'sklearn-ridge-regression':descriptor({adapterId:'python-sklearn-ridge-regression-v1',algorithmId:'sklearn-ridge-regression',provider:'future-python-worker',task:'regression',implementation:{language:'python',runtimeImplementation:'CPython',package:'scikit-learn',module:'sklearn.linear_model',className:'Ridge'},requiredDependencies:['scikit-learn'],requiredCapabilities:{fit:true,predict:true,predictProbability:false,evaluate:true},hyperparameterMapping:{mode:'exact-frozen-keys',keys:['alpha','fit_intercept','random_state']},deterministicSeedPolicy:{type:'frozen-hyperparameter',parameter:'random_state',required:true}}),
  },
  governance:{...MODEL_ADAPTER_ENVIRONMENT_GOVERNANCE},
});

function descriptorForEnvelope(envelope){const id=envelope?.algorithm?.id,descriptor=MODEL_ADAPTER_DESCRIPTOR_REGISTRY.descriptors[id];if(!descriptor)throw new Error(`model-adapter-descriptor-not-found:${id||'missing'}`);return descriptor;}
function semanticLock(lock,fingerprintField){const copy=clone(lock||{});delete copy[fingerprintField];return copy;}
export const fingerprintModelDependencyLock=lock=>fingerprint(semanticLock(lock,'dependencyLockFingerprint'));
export const fingerprintModelEnvironmentLock=lock=>fingerprint(semanticLock(lock,'environmentLockFingerprint'));
export const fingerprintModelAdapterPreparation=record=>fingerprint(semanticLock(record,'preparationFingerprint'));

export function buildModelDependencyLockRequirement(envelope){const validation=validateModelExecutionEnvelope(envelope);if(!validation.pass)throw new Error(`invalid-execution-envelope:${validation.errorCodes.join(',')}`);const descriptor=descriptorForEnvelope(envelope);const requirement={version:'model-dependency-lock-requirement-0.1',status:'UNRESOLVED',adapterId:descriptor.adapterId,algorithmId:descriptor.algorithmId,runtimeImplementation:descriptor.implementation.runtimeImplementation,requiredDependencies:descriptor.requiredDependencies.map(name=>({name,requiredExactVersion:true,requiredArtifactSha256:true})),resolverContract:{type:'future-python-lock-resolver',networkInstallAllowedInV034:false,lockMustBeProducedFromActualInstalledEnvironment:true},requirementFingerprint:null};requirement.requirementFingerprint=fingerprint(semanticLock(requirement,'requirementFingerprint'));return deepFreeze(requirement);}

export function validateResolvedModelDependencyLock(lock,descriptor){const errors=[];if(lock?.version!==MODEL_DEPENDENCY_LOCK_VERSION)errors.push('dependency-lock-version-mismatch');if(lock?.status!=='RESOLVED')errors.push('dependency-lock-not-resolved');if(lock?.adapterId!==descriptor?.adapterId||lock?.algorithmId!==descriptor?.algorithmId)errors.push('dependency-lock-adapter-drift');if(lock?.runtimeImplementation!==descriptor?.implementation?.runtimeImplementation)errors.push('dependency-lock-runtime-drift');if(lock?.resolver?.networkInstallPerformed!==false)errors.push('dependency-lock-install-side-effect-forbidden');const deps=Array.isArray(lock?.dependencies)?lock.dependencies:[];if(deps.length!==descriptor?.requiredDependencies?.length)errors.push('dependency-lock-dependency-count-drift');const names=deps.map(item=>item?.name);if(new Set(names).size!==names.length)errors.push('dependency-lock-duplicate-dependency');for(const name of descriptor?.requiredDependencies||[]){const item=deps.find(dep=>dep?.name===name);if(!item)errors.push(`dependency-lock-missing:${name}`);else {if(!VERSION.test(String(item.version||'')))errors.push(`dependency-version-invalid:${name}`);if(!SHA256.test(String(item.artifactSha256||'')))errors.push(`dependency-artifact-hash-invalid:${name}`);}}if(lock?.dependencyLockFingerprint!==fingerprintModelDependencyLock(lock))errors.push('dependency-lock-fingerprint-mismatch');return {version:'model-dependency-lock-validation-0.1',pass:errors.length===0,errorCount:errors.length,errorCodes:[...new Set(errors)]};}

export function validateResolvedModelEnvironmentLock(lock,{descriptor,dependencyLock,envelope}={}){const errors=[];const envelopeValidation=validateModelExecutionEnvelope(envelope);if(!envelopeValidation.pass)errors.push(...envelopeValidation.errorCodes.map(code=>`envelope:${code}`));const dependencyValidation=validateResolvedModelDependencyLock(dependencyLock,descriptor);if(!dependencyValidation.pass)errors.push(...dependencyValidation.errorCodes);if(lock?.version!==MODEL_ENVIRONMENT_LOCK_VERSION)errors.push('environment-lock-version-mismatch');if(lock?.status!=='RESOLVED')errors.push('environment-lock-not-resolved');if(lock?.adapterId!==descriptor?.adapterId||lock?.algorithmId!==descriptor?.algorithmId)errors.push('environment-lock-adapter-drift');const runtime=lock?.runtime||{};if(runtime.implementation!=='CPython')errors.push('environment-runtime-implementation-invalid');if(!/^3\.[0-9]+\.[0-9]+$/.test(String(runtime.pythonVersion||'')))errors.push('environment-python-version-invalid');if(!String(runtime.platformSystem||'').trim()||!String(runtime.platformMachine||'').trim())errors.push('environment-platform-identity-missing');if(lock?.dependencyLockFingerprint!==dependencyLock?.dependencyLockFingerprint)errors.push('environment-dependency-lock-drift');if(lock?.source?.codeCommit!==envelope?.source?.codeCommit||!SHA40.test(String(lock?.source?.codeCommit||'')))errors.push('environment-code-commit-drift');if(lock?.source?.envelopeFingerprint!==envelope?.envelopeFingerprint||lock?.source?.matrixBundleFingerprint!==envelope?.createdFrom?.matrixBundleFingerprint||lock?.source?.preprocessingConformanceFingerprint!==envelope?.createdFrom?.preprocessingConformanceFingerprint)errors.push('environment-source-fingerprint-drift');if(lock?.adapterVersion==null||!VERSION.test(String(lock.adapterVersion)))errors.push('environment-adapter-version-invalid');const seedParameter=descriptor?.deterministicSeedPolicy?.parameter,expectedSeed=envelope?.algorithm?.hyperparameters?.[seedParameter];if(lock?.deterministicSeedPolicy?.type!=='frozen-hyperparameter'||lock?.deterministicSeedPolicy?.parameter!==seedParameter||lock?.deterministicSeedPolicy?.value!==expectedSeed)errors.push('environment-seed-policy-drift');if(lock?.environmentLockFingerprint!==fingerprintModelEnvironmentLock(lock))errors.push('environment-lock-fingerprint-mismatch');return {version:'model-environment-lock-validation-0.1',pass:errors.length===0,errorCount:errors.length,errorCodes:[...new Set(errors)]};}

export function evaluateModelAdapterPreparation({envelope,dependencyLock=null,environmentLock=null}={}){const blockers=[];const envelopeValidation=validateModelExecutionEnvelope(envelope);if(!envelopeValidation.pass)blockers.push(...envelopeValidation.errorCodes.map(code=>`execution-envelope:${code}`));let descriptor=null;try{descriptor=descriptorForEnvelope(envelope);}catch(error){blockers.push(String(error?.message||error));}
  if(descriptor){if(descriptor.algorithmId!==envelope?.algorithm?.id)blockers.push('adapter-algorithm-mismatch');if(descriptor.provider!==envelope?.algorithm?.provider)blockers.push('adapter-provider-mismatch');if(descriptor.task!==envelope?.dataContract?.target?.task)blockers.push('adapter-task-mismatch');const frozenKeys=Object.keys(envelope?.algorithm?.hyperparameters||{}),mappingKeys=descriptor.hyperparameterMapping.keys;if(canonical([...frozenKeys].sort())!==canonical([...mappingKeys].sort()))blockers.push('adapter-hyperparameter-map-drift');if(descriptor.installed!==true)blockers.push('model-adapter-not-installed');}
  let dependencyValidation=null;if(dependencyLock&&descriptor){dependencyValidation=validateResolvedModelDependencyLock(dependencyLock,descriptor);if(!dependencyValidation.pass)blockers.push(...dependencyValidation.errorCodes);}else blockers.push('dependency-lock-unresolved');let environmentValidation=null;if(environmentLock&&descriptor&&dependencyLock){environmentValidation=validateResolvedModelEnvironmentLock(environmentLock,{descriptor,dependencyLock,envelope});if(!environmentValidation.pass)blockers.push(...environmentValidation.errorCodes);}else blockers.push('environment-lock-unresolved');blockers.push('execution-authority-not-implemented');const unique=[...new Set(blockers)];return {version:MODEL_ADAPTER_PREPARATION_VERSION,status:unique.length?'BLOCKED':'READY',adapterDescriptor:descriptor?clone(descriptor):null,dependencyLockRequirement:descriptor&&envelopeValidation.pass?clone(buildModelDependencyLockRequirement(envelope)):null,dependencyValidation,environmentValidation,preparationReady:envelopeValidation.pass&&!!descriptor,executionReady:false,blockers:unique,governance:{...MODEL_ADAPTER_ENVIRONMENT_GOVERNANCE}};}

export function buildModelAdapterPreparationRecord(input){const evaluation=evaluateModelAdapterPreparation(input);const record={...clone(evaluation),status:'PREPARED_EXECUTION_BLOCKED',executionReady:false,preparationFingerprint:null};record.preparationFingerprint=fingerprintModelAdapterPreparation(record);return deepFreeze(record);}
