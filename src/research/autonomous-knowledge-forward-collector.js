import { runKnowledgeForwardSnapshot } from './knowledge-forward-runner.js';
import { mergeKnowledgeForwardArchive } from './knowledge-forward-store.js';
import { KNOWLEDGE_FORWARD_EPOCH_ID } from './knowledge-forward-epoch.js';
import { auditKnowledgeForwardRemoteDocument, KNOWLEDGE_FORWARD_REPLAY_AUDIT_VERSION } from './knowledge-forward-replay-audit.js';
import {
  buildKnowledgeProspectiveAttributionSnapshot,
  mergeProspectiveAttributionLedger,
  auditProspectiveAttributionLedger,
} from './prospective-attribution-ledger.js';
import {
  FROZEN_KNOWLEDGE_EVALUATOR_COMMIT,
  KRAKEN_SPOT_BTCUSD_4H_URL,
  detectKnowledgeForwardMarketGaps,
  emptyKnowledgeForwardRemoteDocument,
  mergeKnowledgeForwardMarketBars,
  normalizeKnowledgeForwardRemoteDocument,
  normalizeKrakenSpot4H,
} from './knowledge-forward-remote.js';

export const AUTONOMOUS_KNOWLEDGE_FORWARD_COLLECTOR_VERSION = 'autonomous-knowledge-forward-collector-0.3-attribution';
export const PREVIOUS_AUTONOMOUS_KNOWLEDGE_FORWARD_COLLECTOR_VERSION = 'autonomous-knowledge-forward-collector-0.2-replay-audit';

function marketSignature(bars = []) {
  if (!bars.length) return 'kraken-spot-btcusd-4h-v1:empty';
  return `kraken-spot-btcusd-4h-v1:${bars[0].t}:${bars.at(-1).t}:${bars.length}`;
}

export async function fetchKrakenClosedBTCUSD4H({ fetchImpl=fetch, nowSeconds=Math.floor(Date.now()/1000) } = {}) {
  const response = await fetchImpl(KRAKEN_SPOT_BTCUSD_4H_URL,{method:'GET',headers:{Accept:'application/json'}});
  if (!response.ok) throw new Error(`Kraken OHLC HTTP ${response.status}`);
  const payload = await response.json();
  return normalizeKrakenSpot4H(payload,nowSeconds);
}

export async function collectKnowledgeForwardAutonomously({
  existingDocument=emptyKnowledgeForwardRemoteDocument(),
  fetchImpl=fetch,
  nowSeconds=Math.floor(Date.now()/1000),
  runAtIso=new Date().toISOString(),
  workflowRunId=null,
  workflowRunAttempt=null,
} = {}) {
  if (existingDocument?.epochId && existingDocument.epochId !== KNOWLEDGE_FORWARD_EPOCH_ID) throw new Error('collector existing archive epoch mismatch');
  if (existingDocument?.frozenEvaluatorCommit && existingDocument.frozenEvaluatorCommit !== FROZEN_KNOWLEDGE_EVALUATOR_COMMIT) throw new Error('collector existing archive evaluator mismatch');
  const normalizedExisting = normalizeKnowledgeForwardRemoteDocument(existingDocument);
  if (normalizedExisting.frozenEvaluatorCommit !== FROZEN_KNOWLEDGE_EVALUATOR_COMMIT) throw new Error('collector existing archive evaluator mismatch');

  const incomingBars = await fetchKrakenClosedBTCUSD4H({fetchImpl,nowSeconds});
  if (!incomingBars.length) throw new Error('Kraken returned no closed BTC/USD 4H bars');
  const marketMerge = mergeKnowledgeForwardMarketBars(normalizedExisting.market.bars,incomingBars);
  if (marketMerge.conflicts.length) {
    const timestamps = marketMerge.conflicts.slice(0,5).map(item=>item.timestamp).join(',');
    throw new Error(`market-bar-conflict:${timestamps}`);
  }
  const marketBars = marketMerge.bars;
  const signature = marketSignature(marketBars);
  const prospective = runKnowledgeForwardSnapshot({series:marketBars,endIndex:marketBars.length-1,dataSignature:signature});
  if (prospective.status !== 'complete') throw new Error(`knowledge-forward-evaluator:${prospective.reason || prospective.status}`);
  const mergedEvidence = mergeKnowledgeForwardArchive(normalizedExisting.evidenceArchive,prospective,{updatedAt:runAtIso});

  const attributionSnapshot=buildKnowledgeProspectiveAttributionSnapshot({series:marketBars,observedBarTimes:prospective.observedBarTimes});
  const attributionLedger=mergeProspectiveAttributionLedger(normalizedExisting.attributionLedger,attributionSnapshot,{epochId:KNOWLEDGE_FORWARD_EPOCH_ID,updatedAt:runAtIso});
  if ((attributionLedger.mergeConflicts||[]).length) throw new Error(`knowledge-forward-attribution-conflict:${attributionLedger.mergeConflicts.length}`);
  const attributionAudit=auditProspectiveAttributionLedger({ledger:attributionLedger,epochId:KNOWLEDGE_FORWARD_EPOCH_ID,observedBarTimes:prospective.observedBarTimes});
  if (!attributionAudit.pass) throw new Error(`knowledge-forward-attribution-audit:${attributionAudit.errorCodes.join(',')}`);

  const continuity = detectKnowledgeForwardMarketGaps(marketBars);
  const document = {
    ...normalizedExisting,
    frozenEvaluatorCommit:FROZEN_KNOWLEDGE_EVALUATOR_COMMIT,
    market:{
      ...normalizedExisting.market,
      bars:marketBars,
      continuity,
      firstBarTime:marketBars[0]?.t ?? null,
      lastBarTime:marketBars.at(-1)?.t ?? null,
      closedBarCount:marketBars.length,
      signature,
    },
    evidenceArchive:mergedEvidence,
    attributionLedger,
    attributionAudit:{...attributionAudit,checkedAt:runAtIso},
    collector:{
      version:AUTONOMOUS_KNOWLEDGE_FORWARD_COLLECTOR_VERSION,
      status:continuity.gapCount ? 'warning-market-gap' : 'success',
      lastRunAt:runAtIso,
      sourceFetchedAt:runAtIso,
      workflowRunId:workflowRunId === null ? null : String(workflowRunId),
      workflowRunAttempt:workflowRunAttempt === null ? null : String(workflowRunAttempt),
      evaluatorCommit:FROZEN_KNOWLEDGE_EVALUATOR_COMMIT,
      marketBarsAdded:marketMerge.added,
      marketConflicts:[],
      incomingClosedBars:incomingBars.length,
      totalMarketBars:marketBars.length,
      prospectiveDecisionRecords:prospective.decisions.length,
      prospectiveEvidenceRecords:prospective.evidence.length,
      archivedDecisionRecords:mergedEvidence.decisions.length,
      archivedEvidenceRecords:mergedEvidence.evidence.length,
      archivedAttributionRecords:attributionLedger.records.length,
      browserRequired:false,
      paidApiRequired:false,
      replayAuditRequiredOnceProspectiveBarsExist:true,
      attributionLedgerRequired:true,
    },
  };
  let replayAudit;
  if ((mergedEvidence.observedBarTimes||[]).length) {
    replayAudit=auditKnowledgeForwardRemoteDocument(document);
    if (!replayAudit.pass) throw new Error(`knowledge-forward-replay-audit:${replayAudit.errorCodes.join(',')}`);
  } else {
    replayAudit={version:KNOWLEDGE_FORWARD_REPLAY_AUDIT_VERSION,status:'waiting',pass:false,errorCount:0,errorCodes:[],reason:'no-post-freeze-closed-bar-yet',checked:{marketBars:marketBars.length,observedBars:0,decisionRecords:0,evidenceRecords:0,sources:5},methodology:{replayRequiredOnceProspectiveBarsExist:true}};
  }
  document.audit={...replayAudit,checkedAt:runAtIso};
  return { document,prospective,marketMerge,replayAudit,attributionLedger,attributionAudit };
}
