import { KNOWLEDGE_FORWARD_EPOCH } from './knowledge-forward-epoch.js';
import { KNOWLEDGE_FORWARD_DATA_BRANCH, KNOWLEDGE_FORWARD_DATA_PATH, FROZEN_KNOWLEDGE_EVALUATOR_COMMIT } from './knowledge-forward-remote.js';
import { HIGHER_TIMEFRAME_FORWARD_EPOCH } from './higher-timeframe-forward-epoch.js';
import { HIGHER_TIMEFRAME_FORWARD_DATA_BRANCH, HIGHER_TIMEFRAME_FORWARD_DATA_PATH, HIGHER_TIMEFRAME_FORWARD_FROZEN_COMMIT } from './higher-timeframe-forward-remote.js';

export const PROSPECTIVE_EVIDENCE_REGISTRY_VERSION='prospective-evidence-registry-0.1';

export const PROSPECTIVE_EVIDENCE_STREAMS=Object.freeze([
  Object.freeze({
    epochId:'forward-001',label:'Legacy Strategy Forward',purpose:'frozen-strategy-prospective-demo',
    freezeIso:'2026-08-16T14:27:00Z',freezeLocal:'2026-08-16 23:27:00 JST',freezeUnix:1786890420,
    instrument:'BTCUSD',timeframeHours:4,horizonBars:3,trackedSourceCount:4,benchmarkId:null,
    trackedSet:'champion-001 + three frozen Strategy Registry challengers',
    storageAuthority:'browser-local',durabilityClass:'local-ephemeral',generatedDataBranch:null,generatedDataPath:null,
    autonomousCollector:false,replayAudit:false,
    nextScientificGate:'Legacy observation only; never use as pristine untouched OOS proof.',
    isolation:['champion-live-decision','knowledge-forward-001','htf-forward-001'],
  }),
  Object.freeze({
    epochId:KNOWLEDGE_FORWARD_EPOCH.id,label:'Knowledge Candidate Forward',purpose:'four-fixed-knowledge-candidate-qualification',
    freezeIso:KNOWLEDGE_FORWARD_EPOCH.frozenAtIso,freezeLocal:KNOWLEDGE_FORWARD_EPOCH.frozenAtLocal,freezeUnix:KNOWLEDGE_FORWARD_EPOCH.frozenAtUnix,
    instrument:'BTCUSD',timeframeHours:4,horizonBars:KNOWLEDGE_FORWARD_EPOCH.horizonBars,trackedSourceCount:5,benchmarkId:'champion-001',
    trackedSet:'four fixed Knowledge candidates + champion-001 benchmark',
    storageAuthority:'github-generated-data',durabilityClass:'remote-durable',generatedDataBranch:KNOWLEDGE_FORWARD_DATA_BRANCH,generatedDataPath:KNOWLEDGE_FORWARD_DATA_PATH,
    frozenEvaluatorCommit:FROZEN_KNOWLEDGE_EVALUATOR_COMMIT,autonomousCollector:true,replayAudit:true,
    nextScientificGate:'Stage A qualification minimums + Fresh Replay PASS; at most one human nominee may later enter knowledge-confirm-001.',
    isolation:['champion-live-decision','forward-001','htf-forward-001'],
  }),
  Object.freeze({
    epochId:HIGHER_TIMEFRAME_FORWARD_EPOCH.id,label:'Higher-Timeframe Wave3 Forward',purpose:'fixed-wave3-prospective-observation',
    freezeIso:HIGHER_TIMEFRAME_FORWARD_EPOCH.frozenAtIso,freezeLocal:HIGHER_TIMEFRAME_FORWARD_EPOCH.frozenAtLocal,freezeUnix:HIGHER_TIMEFRAME_FORWARD_EPOCH.frozenAtUnix,
    instrument:'BTCUSD',timeframeHours:4,horizonBars:HIGHER_TIMEFRAME_FORWARD_EPOCH.horizonBars,trackedSourceCount:2,benchmarkId:'champion-001',
    trackedSet:'fixed higher-timeframe-wave3-reference + champion-001 benchmark',
    storageAuthority:'github-generated-data',durabilityClass:'remote-durable',generatedDataBranch:HIGHER_TIMEFRAME_FORWARD_DATA_BRANCH,generatedDataPath:HIGHER_TIMEFRAME_FORWARD_DATA_PATH,
    frozenEvaluatorCommit:HIGHER_TIMEFRAME_FORWARD_FROZEN_COMMIT,autonomousCollector:true,replayAudit:true,
    nextScientificGate:'Accumulate untouched prospective Wave3 evidence before any candidate/tournament integration decision.',
    isolation:['champion-live-decision','forward-001','knowledge-forward-001'],
  }),
]);

export const PROSPECTIVE_EVIDENCE_REGISTRY=Object.freeze({
  version:PROSPECTIVE_EVIDENCE_REGISTRY_VERSION,
  streams:PROSPECTIVE_EVIDENCE_STREAMS,
  governance:Object.freeze({
    inventoryOnly:true,ranking:false,winnerSelection:false,scoreAggregation:false,crossStreamPnlAggregation:false,
    usedByLiveDecisionEngine:false,usedByAnyProspectiveDecisionEngine:false,automaticPromotion:false,championMutation:false,
    generatedDataBranchesMustBeUnique:true,epochIdsMustBeUnique:true,remotePathsMustBeUnique:true,
  }),
});

export function assertProspectiveEvidenceRegistry(){
  const ids=PROSPECTIVE_EVIDENCE_STREAMS.map(item=>item.epochId);
  if(new Set(ids).size!==ids.length)throw new Error('prospective-registry-duplicate-epoch-id');
  const remote=PROSPECTIVE_EVIDENCE_STREAMS.filter(item=>item.generatedDataBranch);
  const branches=remote.map(item=>item.generatedDataBranch),paths=remote.map(item=>`${item.generatedDataBranch}:${item.generatedDataPath}`);
  if(new Set(branches).size!==branches.length)throw new Error('prospective-registry-duplicate-data-branch');
  if(new Set(paths).size!==paths.length)throw new Error('prospective-registry-duplicate-data-path');
  if(PROSPECTIVE_EVIDENCE_STREAMS.length!==3)throw new Error('prospective-registry-stream-count-drift');
  return true;
}

export function getProspectiveEvidenceRegistrySnapshot(){assertProspectiveEvidenceRegistry();return JSON.parse(JSON.stringify(PROSPECTIVE_EVIDENCE_REGISTRY));}
