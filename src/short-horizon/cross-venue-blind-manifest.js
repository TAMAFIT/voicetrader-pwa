import crypto from 'node:crypto';
import {CROSS_VENUE_HYPOTHESIS_SCHEMA,CROSS_VENUE_FROZEN_SPEC_FINGERPRINT} from './cross-venue-preregistered-hypothesis.js';

export const CROSS_VENUE_BLIND_MANIFEST_SCHEMA='voicetrader-cross-venue-blind-manifest-v1';
export const CROSS_VENUE_BLIND_PROTOCOL=Object.freeze({
  examProtocolId:'CROSS_VENUE_BLIND_EXAM_PROTOCOL_V1',
  instruments:Object.freeze(['BTCUSD','ETHUSD']),
  sampleRoles:Object.freeze(['BOUNDARY_PRIMARY','PHASE_CONTROL']),
  perStratumCandidates:100,
  totalCandidates:400,
  selectionOrder:'CHRONOLOGICAL_THEN_OBSERVATION_ID',
  noTopUpAfterReveal:true,
  minimumDirectionalPairsAfterReveal:200,
  resultUse:'DESCRIPTIVE_REPLICATION_ONLY',
});
export const CROSS_VENUE_BLIND_PROTOCOL_FINGERPRINT=crypto.createHash('sha256').update(JSON.stringify(CROSS_VENUE_BLIND_PROTOCOL)).digest('hex');

function stratumKey(o){return `${o.canonicalInstrument}|${o.sampleRole}`;}
function validSealed(o){return o?.schemaVersion===CROSS_VENUE_HYPOTHESIS_SCHEMA&&o?.specFingerprint===CROSS_VENUE_FROZEN_SPEC_FINGERPRINT&&o?.evaluationPartition?.role==='BLIND_EXAM'&&o?.eligible===true&&CROSS_VENUE_BLIND_PROTOCOL.instruments.includes(o?.canonicalInstrument)&&CROSS_VENUE_BLIND_PROTOCOL.sampleRoles.includes(o?.sampleRole)&&o?.venueDecisions==null&&o?.replication==null&&o?.blindState?.status==='SEALED'&&o?.blindState?.resultExposed===false;}
function expectedStrata(){const out=[];for(const instrument of CROSS_VENUE_BLIND_PROTOCOL.instruments)for(const role of CROSS_VENUE_BLIND_PROTOCOL.sampleRoles)out.push(`${instrument}|${role}`);return out;}
function hashIds(ids){return crypto.createHash('sha256').update(ids.join('\n')).digest('hex');}

export function inspectBlindManifestReadiness(sealedRecords){
  const unique=new Map(),invalid=[];
  for(const o of sealedRecords||[]){if(!validSealed(o)){invalid.push(o?.observationId??null);continue;}if(!unique.has(o.observationId))unique.set(o.observationId,o);}
  const strata={};for(const key of expectedStrata())strata[key]=[];
  for(const o of unique.values())strata[stratumKey(o)]?.push(o);
  for(const rows of Object.values(strata))rows.sort((a,b)=>Number(a.startTimestampMs)-Number(b.startTimestampMs)||String(a.observationId).localeCompare(String(b.observationId)));
  const counts=Object.fromEntries(Object.entries(strata).map(([k,v])=>[k,v.length])),deficits=Object.fromEntries(Object.entries(strata).map(([k,v])=>[k,Math.max(0,CROSS_VENUE_BLIND_PROTOCOL.perStratumCandidates-v.length)]));
  const ready=Object.values(deficits).every((n)=>n===0);
  return {ready,validUniqueSealed:unique.size,invalidOrUnsealed:invalid.length,stratumCounts:counts,stratumDeficits:deficits,requiredPerStratum:CROSS_VENUE_BLIND_PROTOCOL.perStratumCandidates,requiredTotal:CROSS_VENUE_BLIND_PROTOCOL.totalCandidates,resultsAccessed:false};
}

export function buildCrossVenueBlindManifest(sealedRecords,{createdAtMs=Date.now()}={}){
  const readiness=inspectBlindManifestReadiness(sealedRecords);
  if(!readiness.ready)return {schemaVersion:CROSS_VENUE_BLIND_MANIFEST_SCHEMA,status:'NOT_READY',protocolFingerprint:CROSS_VENUE_BLIND_PROTOCOL_FINGERPRINT,specFingerprint:CROSS_VENUE_FROZEN_SPEC_FINGERPRINT,createdAtMs:Number(createdAtMs),readiness,selected:[],selectionHash:null,governance:{resultsAccessed:false,resultsExposed:false,selectionUsesResultValues:false,manifestImmutableAfterReveal:true,noTopUpAfterReveal:true,adaptiveLearningAuthorized:false,predictionInputAuthorized:false,automaticPromotion:false,executionAuthorized:false,actualNetEvAvailable:false}};
  const unique=new Map();for(const o of sealedRecords||[])if(validSealed(o)&&!unique.has(o.observationId))unique.set(o.observationId,o);
  const selected=[];
  for(const key of expectedStrata()){
    const rows=[...unique.values()].filter((o)=>stratumKey(o)===key).sort((a,b)=>Number(a.startTimestampMs)-Number(b.startTimestampMs)||String(a.observationId).localeCompare(String(b.observationId))).slice(0,CROSS_VENUE_BLIND_PROTOCOL.perStratumCandidates);
    for(const o of rows)selected.push({observationId:o.observationId,pairId:o.pairId,canonicalInstrument:o.canonicalInstrument,sampleRole:o.sampleRole,startTimestampMs:o.startTimestampMs,endTimestampMs:o.endTimestampMs,evaluationEpochId:o.evaluationPartition?.epochId??null,specFingerprint:o.specFingerprint});
  }
  selected.sort((a,b)=>a.canonicalInstrument.localeCompare(b.canonicalInstrument)||a.sampleRole.localeCompare(b.sampleRole)||Number(a.startTimestampMs)-Number(b.startTimestampMs)||a.observationId.localeCompare(b.observationId));
  const ids=selected.map((x)=>x.observationId),selectionHash=hashIds(ids),manifestId=crypto.createHash('sha256').update([CROSS_VENUE_BLIND_PROTOCOL.examProtocolId,CROSS_VENUE_BLIND_PROTOCOL_FINGERPRINT,CROSS_VENUE_FROZEN_SPEC_FINGERPRINT,selectionHash].join('|')).digest('hex');
  return {schemaVersion:CROSS_VENUE_BLIND_MANIFEST_SCHEMA,status:'READY_SEALED',manifestId,protocolFingerprint:CROSS_VENUE_BLIND_PROTOCOL_FINGERPRINT,specFingerprint:CROSS_VENUE_FROZEN_SPEC_FINGERPRINT,createdAtMs:Number(createdAtMs),readiness,selected,selectionHash,selection:{order:CROSS_VENUE_BLIND_PROTOCOL.selectionOrder,perStratum:CROSS_VENUE_BLIND_PROTOCOL.perStratumCandidates,total:selected.length},governance:{resultsAccessed:false,resultsExposed:false,selectionUsesResultValues:false,manifestImmutableAfterReveal:true,noTopUpAfterReveal:true,adaptiveLearningAuthorized:false,predictionInputAuthorized:false,automaticPromotion:false,executionAuthorized:false,realMoneyRouting:false,orderSubmission:false,actualNetEvAvailable:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}};
}

export function verifyCrossVenueBlindManifest(manifest){
  if(manifest?.schemaVersion!==CROSS_VENUE_BLIND_MANIFEST_SCHEMA||manifest?.status!=='READY_SEALED')throw new Error('cross-venue-blind-manifest-not-ready');
  if(manifest.protocolFingerprint!==CROSS_VENUE_BLIND_PROTOCOL_FINGERPRINT||manifest.specFingerprint!==CROSS_VENUE_FROZEN_SPEC_FINGERPRINT)throw new Error('cross-venue-blind-manifest-fingerprint-mismatch');
  if(!Array.isArray(manifest.selected)||manifest.selected.length!==CROSS_VENUE_BLIND_PROTOCOL.totalCandidates)throw new Error('cross-venue-blind-manifest-selection-count');
  const ids=manifest.selected.map((x)=>x.observationId);if(new Set(ids).size!==ids.length)throw new Error('cross-venue-blind-manifest-duplicate');if(hashIds(ids)!==manifest.selectionHash)throw new Error('cross-venue-blind-manifest-selection-hash');
  const counts={};for(const x of manifest.selected){const key=`${x.canonicalInstrument}|${x.sampleRole}`;counts[key]=(counts[key]||0)+1;}for(const key of expectedStrata())if(counts[key]!==CROSS_VENUE_BLIND_PROTOCOL.perStratumCandidates)throw new Error(`cross-venue-blind-manifest-stratum:${key}`);
  if(manifest.governance?.resultsAccessed!==false||manifest.governance?.resultsExposed!==false||manifest.governance?.selectionUsesResultValues!==false)throw new Error('cross-venue-blind-manifest-governance');return true;
}
