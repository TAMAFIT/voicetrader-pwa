import { PROSPECTIVE_EVIDENCE_STREAMS, PROSPECTIVE_EVIDENCE_REGISTRY_VERSION, assertProspectiveEvidenceRegistry } from './prospective-evidence-registry.js';
import { summarizeKnowledgeForwardArchive } from './knowledge-forward-store.js';
import { summarizeHigherTimeframeForwardArchive } from './higher-timeframe-forward-store.js';

export const PROSPECTIVE_EVIDENCE_HEALTH_VERSION='prospective-evidence-health-0.1';

function legacyHealth(stream,forwardDemoEvaluation){
  const summary=forwardDemoEvaluation?.summary||forwardDemoEvaluation?.archiveHealth||forwardDemoEvaluation?.health||null;
  const archive=forwardDemoEvaluation?.archive||null;
  const observedBars=Number(summary?.observedBars??archive?.observedBarTimes?.length??0)||0;
  const evidenceCount=Number(summary?.evidenceCount??archive?.evidence?.length??0)||0;
  return {
    ...stream,
    availability:forwardDemoEvaluation?'session-loaded':'session-not-loaded',
    healthStatus:forwardDemoEvaluation?'local-only':'unknown-local',
    observedBars,evidenceCount,
    decisionCount:Number(summary?.decisionCount??archive?.decisions?.length??0)||0,
    collectorStatus:'not-applicable',collectorLastRun:null,replayAuditStatus:'not-applicable',replayAuditPass:null,
    healthWarnings:['browser-local-not-server-durable'],
  };
}

function knowledgeHealth(stream,remoteDocument,error){
  if(!remoteDocument)return {...stream,availability:'remote-unavailable',healthStatus:'unavailable',observedBars:0,decisionCount:0,evidenceCount:0,collectorStatus:'unavailable',collectorLastRun:null,replayAuditStatus:'unavailable',replayAuditPass:false,healthWarnings:[error||'remote-unavailable']};
  const summary=summarizeKnowledgeForwardArchive(remoteDocument.evidenceArchive);
  const warnings=[];
  if(Number(remoteDocument.market?.continuity?.gapCount||0)>0)warnings.push('market-gap');
  if((remoteDocument.collector?.marketConflicts||[]).length)warnings.push('market-conflict');
  if(remoteDocument.audit?.status==='fail')warnings.push('replay-audit-fail');
  if(remoteDocument.collector?.status!=='success')warnings.push(`collector-${remoteDocument.collector?.status||'unknown'}`);
  return {...stream,availability:'remote-loaded',healthStatus:warnings.length?'warning':'healthy',observedBars:summary.observedBars,decisionCount:summary.decisionCount,evidenceCount:summary.evidenceCount,collectorStatus:remoteDocument.collector?.status||'unknown',collectorLastRun:remoteDocument.collector?.lastRunAt||null,replayAuditStatus:remoteDocument.audit?.status||'unknown',replayAuditPass:remoteDocument.audit?.pass===true,marketBars:Number(remoteDocument.market?.closedBarCount??remoteDocument.market?.bars?.length??0)||0,healthWarnings:warnings};
}

function htfHealth(stream,remoteDocument,error){
  if(!remoteDocument)return {...stream,availability:'remote-unavailable',healthStatus:'unavailable',observedBars:0,decisionCount:0,evidenceCount:0,collectorStatus:'unavailable',collectorLastRun:null,replayAuditStatus:'unavailable',replayAuditPass:false,healthWarnings:[error||'remote-unavailable']};
  const summary=summarizeHigherTimeframeForwardArchive(remoteDocument.evidenceArchive);
  const warnings=[];
  if(Number(remoteDocument.market?.continuity?.gapCount||0)>0)warnings.push('market-gap');
  if((remoteDocument.collector?.marketConflicts||[]).length)warnings.push('market-conflict');
  if((remoteDocument.evidenceArchive?.mergeConflicts||[]).length)warnings.push('evidence-conflict');
  if(remoteDocument.audit?.status==='fail')warnings.push('replay-audit-fail');
  if(remoteDocument.collector?.status!=='success')warnings.push(`collector-${remoteDocument.collector?.status||'unknown'}`);
  return {...stream,availability:'remote-loaded',healthStatus:warnings.length?'warning':'healthy',observedBars:summary.observedBars,decisionCount:summary.decisionCount,evidenceCount:summary.evidenceCount,collectorStatus:remoteDocument.collector?.status||'unknown',collectorLastRun:remoteDocument.collector?.lastRunAt||null,replayAuditStatus:remoteDocument.audit?.status||'unknown',replayAuditPass:remoteDocument.audit?.pass===true,marketBars:Number(remoteDocument.market?.closedBarCount??remoteDocument.market?.bars?.length??0)||0,healthWarnings:warnings};
}

export function buildProspectiveEvidenceHealth({forwardDemoEvaluation=null,knowledgeRemote=null,knowledgeRemoteError=null,higherTimeframeRemote=null,higherTimeframeRemoteError=null}={}){
  assertProspectiveEvidenceRegistry();
  const byId=new Map(PROSPECTIVE_EVIDENCE_STREAMS.map(item=>[item.epochId,item]));
  const streams=[
    legacyHealth(byId.get('forward-001'),forwardDemoEvaluation),
    knowledgeHealth(byId.get('knowledge-forward-001'),knowledgeRemote,knowledgeRemoteError),
    htfHealth(byId.get('htf-forward-001'),higherTimeframeRemote,higherTimeframeRemoteError),
  ];
  return {
    version:PROSPECTIVE_EVIDENCE_HEALTH_VERSION,
    registryVersion:PROSPECTIVE_EVIDENCE_REGISTRY_VERSION,
    streams,
    streamCount:streams.length,
    durableRemoteStreamCount:streams.filter(item=>item.durabilityClass==='remote-durable').length,
    autonomousCollectorCount:streams.filter(item=>item.autonomousCollector).length,
    warningStreamCount:streams.filter(item=>item.healthWarnings?.length).length,
    governance:{inventoryOnly:true,ranking:false,winnerSelection:false,crossStreamPnlAggregation:false,usedByLiveDecisionEngine:false,usedByAnyProspectiveDecisionEngine:false},
  };
}
