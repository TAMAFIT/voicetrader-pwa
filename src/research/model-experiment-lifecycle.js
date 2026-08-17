import { fingerprintModelExperimentSpec, validateModelExperimentSpec } from './model-experiment-spec.js';

export const MODEL_EXPERIMENT_LIFECYCLE_VERSION='model-experiment-lifecycle-ledger-0.2';
export const MODEL_EXPERIMENT_LIFECYCLE_AUDIT_VERSION='model-experiment-lifecycle-audit-0.2';
export const MODEL_EXPERIMENT_LIFECYCLE_LEGACY_EMPTY_VERSION='model-experiment-lifecycle-ledger-0.1';
export const MODEL_EXPERIMENT_LIFECYCLE_DATA_BRANCH='model-experiment-lifecycle-data';
export const MODEL_EXPERIMENT_LIFECYCLE_DATA_PATH='data/model-experiment-lifecycle-v1.json';
export const MODEL_EXPERIMENT_LIFECYCLE_GOVERNANCE=Object.freeze({appendOnly:true,draftSnapshotsImmutable:true,mutatesFrozenSpecs:false,controlledWriterRequired:true,workflowDispatchOnly:true,automaticApproval:false,browserWriteAuthority:false,ledgerLaunchesJobs:false,trainingImplemented:false,usedByDecisionEngine:false});

const clone=value=>JSON.parse(JSON.stringify(value));
const deepFreeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const item of Object.values(value))deepFreeze(item);}return value;};
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
const canonical=value=>JSON.stringify(stable(value));
function fnv1a64(text){let hash=0xcbf29ce484222325n;const prime=0x100000001b3n;for(let i=0;i<text.length;i++){hash^=BigInt(text.charCodeAt(i));hash=BigInt.asUintN(64,hash*prime);}return hash.toString(16).padStart(16,'0');}
function eventSemantic(event){const copy=clone(event||{});delete copy.eventFingerprint;delete copy.eventId;return copy;}
export function fingerprintModelExperimentLifecycleEvent(event){return `fnv1a64:${fnv1a64(canonical(eventSemantic(event)))}`;}
const keyOf=(experimentId,revision)=>`${experimentId}#${revision}`;
const validTime=value=>Number.isFinite(Date.parse(value||''));

function draftShapeFromFrozen(frozen){const copy=clone(frozen||{});copy.status='DRAFT';copy.frozenAt=null;copy.approval={humanApproved:false,actor:null,approvedAt:null};copy.semanticFingerprint=null;return copy;}
export function frozenSpecMatchesRegisteredDraft(frozen,draft){const frozenValidation=validateModelExperimentSpec(frozen,{requireFrozen:true});const draftValidation=validateModelExperimentSpec(draft);if(!frozenValidation.pass||!draftValidation.pass||draft?.status!=='DRAFT')return false;return canonical(draftShapeFromFrozen(frozen))===canonical(draft);}

function finalizeEvent(event){const copy=clone(event);copy.eventFingerprint=fingerprintModelExperimentLifecycleEvent(copy);copy.eventId=`${String(copy.type).toLowerCase()}:${copy.experimentId}:r${copy.revision}:${copy.eventFingerprint.slice(-16)}`;return deepFreeze(copy);}

export function createModelExperimentLifecycleDocument({updatedAt=new Date().toISOString()}={}){
  const document={schemaVersion:MODEL_EXPERIMENT_LIFECYCLE_VERSION,updatedAt,draftSpecs:[],frozenSpecs:[],events:[],governance:{...MODEL_EXPERIMENT_LIFECYCLE_GOVERNANCE}};
  document.audit=auditModelExperimentLifecycleDocument(document);
  return document;
}

export function migrateLegacyEmptyModelExperimentLifecycleDocument(document){
  if(document?.schemaVersion===MODEL_EXPERIMENT_LIFECYCLE_VERSION)return clone(document);
  const isLegacyEmpty=document?.schemaVersion===MODEL_EXPERIMENT_LIFECYCLE_LEGACY_EMPTY_VERSION&&Array.isArray(document?.events)&&document.events.length===0&&Array.isArray(document?.frozenSpecs)&&document.frozenSpecs.length===0;
  if(!isLegacyEmpty)throw new Error('lifecycle-migration-requires-empty-v0.1-ledger');
  return createModelExperimentLifecycleDocument({updatedAt:document.updatedAt||new Date().toISOString()});
}

export function createDraftRegisteredEvent(draft,{actor,occurredAt=new Date().toISOString()}={}){
  const validation=validateModelExperimentSpec(draft);if(!validation.pass)throw new Error(`invalid-draft:${validation.errorCodes.join(',')}`);if(draft.status!=='DRAFT')throw new Error('draft-event-requires-draft');if(!String(actor||'').trim())throw new Error('draft-actor-required');if(!validTime(occurredAt))throw new Error('draft-time-invalid');
  return finalizeEvent({version:MODEL_EXPERIMENT_LIFECYCLE_VERSION,type:'DRAFT_REGISTERED',experimentId:draft.experimentId,revision:draft.revision,occurredAt,actor:String(actor),draftFingerprint:fingerprintModelExperimentSpec(draft)});
}

export function createFrozenLifecycleEvent(frozen){
  const validation=validateModelExperimentSpec(frozen,{requireFrozen:true});if(!validation.pass)throw new Error(`invalid-frozen-spec:${validation.errorCodes.join(',')}`);
  return finalizeEvent({version:MODEL_EXPERIMENT_LIFECYCLE_VERSION,type:'FROZEN',experimentId:frozen.experimentId,revision:frozen.revision,occurredAt:frozen.approval.approvedAt,actor:frozen.approval.actor,semanticFingerprint:frozen.semanticFingerprint,datasetCommit:frozen.dataset.commitSha,datasetCutoffTime:frozen.dataset.cutoffTime,codeCommit:frozen.environment.codeCommit,approvalActor:frozen.approval.actor,approvalTime:frozen.approval.approvedAt});
}

export function createRetiredLifecycleEvent(frozen,{actor,reason,occurredAt=new Date().toISOString()}={}){
  const validation=validateModelExperimentSpec(frozen,{requireFrozen:true});if(!validation.pass)throw new Error(`invalid-frozen-spec:${validation.errorCodes.join(',')}`);if(!String(actor||'').trim())throw new Error('retire-actor-required');if(String(reason||'').trim().length<8)throw new Error('retire-reason-too-short');if(!validTime(occurredAt))throw new Error('retire-time-invalid');
  return finalizeEvent({version:MODEL_EXPERIMENT_LIFECYCLE_VERSION,type:'RETIRED',experimentId:frozen.experimentId,revision:frozen.revision,occurredAt,actor:String(actor),reason:String(reason),semanticFingerprint:frozen.semanticFingerprint});
}

export function auditModelExperimentLifecycleDocument(document){
  const errors=[],states={},draftByKey=new Map(),frozenByKey=new Map();
  if(document?.schemaVersion!==MODEL_EXPERIMENT_LIFECYCLE_VERSION)errors.push('schema-version-mismatch');
  const draftSpecs=Array.isArray(document?.draftSpecs)?document.draftSpecs:[];const frozenSpecs=Array.isArray(document?.frozenSpecs)?document.frozenSpecs:[];const events=Array.isArray(document?.events)?document.events:[];
  if(!Array.isArray(document?.draftSpecs))errors.push('draft-specs-not-array');if(!Array.isArray(document?.frozenSpecs))errors.push('frozen-specs-not-array');if(!Array.isArray(document?.events))errors.push('events-not-array');
  const governance=document?.governance||{};for(const [key,expected] of Object.entries(MODEL_EXPERIMENT_LIFECYCLE_GOVERNANCE))if(governance[key]!==expected)errors.push(`governance-drift:${key}`);
  for(const spec of draftSpecs){const key=keyOf(spec?.experimentId,spec?.revision);if(draftByKey.has(key)){errors.push(`duplicate-draft-spec:${key}`);continue;}const validation=validateModelExperimentSpec(spec);if(!validation.pass)errors.push(...validation.errorCodes.map(code=>`draft-spec:${key}:${code}`));if(spec?.status!=='DRAFT')errors.push(`draft-spec-status-drift:${key}`);if(spec?.semanticFingerprint!==null)errors.push(`draft-spec-fingerprint-field-must-be-null:${key}`);draftByKey.set(key,spec);}
  for(const spec of frozenSpecs){const key=keyOf(spec?.experimentId,spec?.revision);if(frozenByKey.has(key)){errors.push(`duplicate-frozen-spec:${key}`);continue;}const validation=validateModelExperimentSpec(spec,{requireFrozen:true});if(!validation.pass)errors.push(...validation.errorCodes.map(code=>`frozen-spec:${key}:${code}`));if(spec?.status!=='FROZEN')errors.push(`frozen-spec-status-drift:${key}`);const draft=draftByKey.get(key);if(draft&&!frozenSpecMatchesRegisteredDraft(spec,draft))errors.push(`frozen-origin-draft-drift:${key}`);frozenByKey.set(key,spec);}
  const seenEventIds=new Set();let priorTime=-Infinity;
  for(const event of events){const key=keyOf(event?.experimentId,event?.revision);const time=Date.parse(event?.occurredAt||'');if(!Number.isFinite(time))errors.push(`event-time-invalid:${event?.eventId||key}`);else if(time<priorTime)errors.push(`event-order-invalid:${event?.eventId||key}`);else priorTime=time;
    if(event?.version!==MODEL_EXPERIMENT_LIFECYCLE_VERSION)errors.push(`event-version-mismatch:${event?.eventId||key}`);const expectedFingerprint=fingerprintModelExperimentLifecycleEvent(event);if(event?.eventFingerprint!==expectedFingerprint)errors.push(`event-fingerprint-mismatch:${event?.eventId||key}`);const expectedId=`${String(event?.type).toLowerCase()}:${event?.experimentId}:r${event?.revision}:${expectedFingerprint.slice(-16)}`;if(event?.eventId!==expectedId)errors.push(`event-id-mismatch:${event?.eventId||key}`);if(seenEventIds.has(event?.eventId))errors.push(`duplicate-event-id:${event?.eventId}`);seenEventIds.add(event?.eventId);
    const state=states[key]||{experimentId:event?.experimentId,revision:event?.revision,effectiveStatus:null,draftRegistered:false,frozen:false,retired:false,draftFingerprint:null,semanticFingerprint:null};
    if(event?.type==='DRAFT_REGISTERED'){const draft=draftByKey.get(key);if(state.draftRegistered||state.frozen||state.retired)errors.push(`illegal-draft-transition:${key}`);if(!draft)errors.push(`draft-snapshot-missing:${key}`);else {const fp=fingerprintModelExperimentSpec(draft);if(event.draftFingerprint!==fp)errors.push(`draft-fingerprint-drift:${key}`);}if(!String(event?.actor||'').trim())errors.push(`draft-actor-missing:${key}`);if(!/^fnv1a64:[0-9a-f]{16}$/.test(String(event?.draftFingerprint||'')))errors.push(`draft-fingerprint-invalid:${key}`);state.draftRegistered=true;state.effectiveStatus='DRAFT';state.draftFingerprint=event.draftFingerprint;}
    else if(event?.type==='FROZEN'){const spec=frozenByKey.get(key),draft=draftByKey.get(key);if(!state.draftRegistered)errors.push(`freeze-without-draft:${key}`);if(state.frozen||state.retired)errors.push(`duplicate-or-late-freeze:${key}`);if(!draft)errors.push(`freeze-draft-snapshot-missing:${key}`);if(!spec)errors.push(`freeze-spec-missing:${key}`);else {if(draft&&!frozenSpecMatchesRegisteredDraft(spec,draft))errors.push(`freeze-origin-draft-drift:${key}`);if(event.semanticFingerprint!==spec.semanticFingerprint)errors.push(`freeze-fingerprint-drift:${key}`);if(event.datasetCommit!==spec.dataset.commitSha||Number(event.datasetCutoffTime)!==Number(spec.dataset.cutoffTime))errors.push(`freeze-dataset-drift:${key}`);if(event.codeCommit!==spec.environment.codeCommit)errors.push(`freeze-code-drift:${key}`);if(event.approvalActor!==spec.approval.actor||event.approvalTime!==spec.approval.approvedAt||event.actor!==spec.approval.actor||event.occurredAt!==spec.approval.approvedAt)errors.push(`freeze-approval-drift:${key}`);}state.frozen=true;state.effectiveStatus='FROZEN';state.semanticFingerprint=event.semanticFingerprint;}
    else if(event?.type==='RETIRED'){const spec=frozenByKey.get(key);if(!state.frozen||state.retired)errors.push(`illegal-retire-transition:${key}`);if(!spec)errors.push(`retire-spec-missing:${key}`);else if(event.semanticFingerprint!==spec.semanticFingerprint)errors.push(`retire-fingerprint-drift:${key}`);if(String(event?.reason||'').trim().length<8)errors.push(`retire-reason-invalid:${key}`);if(!String(event?.actor||'').trim())errors.push(`retire-actor-missing:${key}`);state.retired=true;state.effectiveStatus='RETIRED';state.semanticFingerprint=event.semanticFingerprint;}
    else errors.push(`unknown-event-type:${event?.type||'missing'}`);
    states[key]=state;
  }
  for(const [key] of draftByKey)if(!states[key]?.draftRegistered)errors.push(`orphan-draft-spec:${key}`);
  for(const [key] of frozenByKey)if(!states[key]?.frozen)errors.push(`orphan-frozen-spec:${key}`);
  const effectiveStates=Object.values(states).sort((a,b)=>`${a.experimentId}#${a.revision}`.localeCompare(`${b.experimentId}#${b.revision}`));
  const counts={draft:effectiveStates.filter(x=>x.effectiveStatus==='DRAFT').length,frozen:effectiveStates.filter(x=>x.effectiveStatus==='FROZEN').length,retired:effectiveStates.filter(x=>x.effectiveStatus==='RETIRED').length};
  return {version:MODEL_EXPERIMENT_LIFECYCLE_AUDIT_VERSION,status:errors.length?'fail':'pass',pass:errors.length===0,errorCount:errors.length,errorCodes:[...new Set(errors)],checked:{draftSpecs:draftSpecs.length,frozenSpecs:frozenSpecs.length,events:events.length},counts,effectiveStates};
}

export function appendModelExperimentLifecycleEvent(document,event,{draftSpec=null,frozenSpec=null,updatedAt=event?.occurredAt||new Date().toISOString()}={}){
  const before=auditModelExperimentLifecycleDocument(document);if(!before.pass)throw new Error(`lifecycle-document-invalid:${before.errorCodes.join(',')}`);const next=clone(document);next.events.push(clone(event));
  if(event?.type==='DRAFT_REGISTERED'){if(!draftSpec)throw new Error('draft-spec-required');const validation=validateModelExperimentSpec(draftSpec);if(!validation.pass||draftSpec.status!=='DRAFT')throw new Error(`invalid-draft-spec:${validation.errorCodes.join(',')}`);next.draftSpecs.push(clone(draftSpec));}
  if(event?.type==='FROZEN'){if(!frozenSpec)throw new Error('frozen-spec-required');const validation=validateModelExperimentSpec(frozenSpec,{requireFrozen:true});if(!validation.pass)throw new Error(`invalid-frozen-spec:${validation.errorCodes.join(',')}`);next.frozenSpecs.push(clone(frozenSpec));}
  next.updatedAt=updatedAt;next.audit=auditModelExperimentLifecycleDocument(next);if(!next.audit.pass)throw new Error(`lifecycle-append-rejected:${next.audit.errorCodes.join(',')}`);return next;
}
