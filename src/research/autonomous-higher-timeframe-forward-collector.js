import { runHigherTimeframeForwardSnapshot } from './higher-timeframe-forward-runner.js';
import { mergeHigherTimeframeForwardArchive } from './higher-timeframe-forward-store.js';
import { auditHigherTimeframeForwardDocument, HIGHER_TIMEFRAME_FORWARD_REPLAY_AUDIT_VERSION } from './higher-timeframe-forward-replay-audit.js';
import {
  buildHigherTimeframeProspectiveAttributionSnapshot,
  mergeProspectiveAttributionLedger,
  auditProspectiveAttributionLedger,
} from './prospective-attribution-ledger.js';
import {
  HIGHER_TIMEFRAME_FORWARD_FROZEN_COMMIT,
  HIGHER_TIMEFRAME_FORWARD_KRAKEN_URL,
  detectKnowledgeForwardMarketGaps,
  emptyHigherTimeframeForwardRemoteDocument,
  mergeKnowledgeForwardMarketBars,
  normalizeHigherTimeframeForwardRemoteDocument,
  normalizeKrakenSpot4H,
} from './higher-timeframe-forward-remote.js';
import { HIGHER_TIMEFRAME_FORWARD_EPOCH_ID } from './higher-timeframe-forward-epoch.js';

export const AUTONOMOUS_HIGHER_TIMEFRAME_FORWARD_COLLECTOR_VERSION='autonomous-htf-forward-collector-0.2-attribution';
function marketSignature(bars=[]){return bars.length?`kraken-spot-btcusd-4h-v1:${bars[0].t}:${bars.at(-1).t}:${bars.length}`:'kraken-spot-btcusd-4h-v1:empty';}
export async function fetchHigherTimeframeForwardKraken({fetchImpl=fetch,nowSeconds=Math.floor(Date.now()/1000)}={}){const response=await fetchImpl(HIGHER_TIMEFRAME_FORWARD_KRAKEN_URL,{method:'GET',headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`Kraken OHLC HTTP ${response.status}`);return normalizeKrakenSpot4H(await response.json(),nowSeconds);}

export async function collectHigherTimeframeForwardAutonomously({existingDocument=emptyHigherTimeframeForwardRemoteDocument(),fetchImpl=fetch,nowSeconds=Math.floor(Date.now()/1000),runAtIso=new Date().toISOString(),workflowRunId=null,workflowRunAttempt=null}={}){
  if(existingDocument?.epochId&&existingDocument.epochId!==HIGHER_TIMEFRAME_FORWARD_EPOCH_ID)throw new Error('htf collector existing epoch mismatch');
  if(existingDocument?.frozenEvaluatorCommit&&existingDocument.frozenEvaluatorCommit!==HIGHER_TIMEFRAME_FORWARD_FROZEN_COMMIT)throw new Error('htf collector existing evaluator mismatch');
  const existing=normalizeHigherTimeframeForwardRemoteDocument(existingDocument);
  const incoming=await fetchHigherTimeframeForwardKraken({fetchImpl,nowSeconds});if(!incoming.length)throw new Error('Kraken returned no closed BTC/USD 4H bars');
  const mergedMarket=mergeKnowledgeForwardMarketBars(existing.market.bars,incoming);if(mergedMarket.conflicts.length)throw new Error(`htf-market-bar-conflict:${mergedMarket.conflicts.slice(0,5).map(item=>item.timestamp).join(',')}`);
  const bars=mergedMarket.bars,signature=marketSignature(bars),snapshot=runHigherTimeframeForwardSnapshot({series:bars,endIndex:bars.length-1,dataSignature:signature});if(snapshot.status!=='complete')throw new Error(`htf-forward-evaluator:${snapshot.reason||snapshot.status}`);
  const archive=mergeHigherTimeframeForwardArchive(existing.evidenceArchive,snapshot,{updatedAt:runAtIso});if(archive.mergeConflicts.length)throw new Error(`htf-forward-evidence-conflict:${archive.mergeConflicts.length}`);

  const attributionSnapshot=buildHigherTimeframeProspectiveAttributionSnapshot({series:bars,observedBarTimes:snapshot.observedBarTimes});
  const attributionLedger=mergeProspectiveAttributionLedger(existing.attributionLedger,attributionSnapshot,{epochId:HIGHER_TIMEFRAME_FORWARD_EPOCH_ID,updatedAt:runAtIso});
  if((attributionLedger.mergeConflicts||[]).length)throw new Error(`htf-forward-attribution-conflict:${attributionLedger.mergeConflicts.length}`);
  const attributionAudit=auditProspectiveAttributionLedger({ledger:attributionLedger,epochId:HIGHER_TIMEFRAME_FORWARD_EPOCH_ID,observedBarTimes:snapshot.observedBarTimes});
  if(!attributionAudit.pass)throw new Error(`htf-forward-attribution-audit:${attributionAudit.errorCodes.join(',')}`);

  const continuity=detectKnowledgeForwardMarketGaps(bars);
  const document={...existing,frozenEvaluatorCommit:HIGHER_TIMEFRAME_FORWARD_FROZEN_COMMIT,market:{...existing.market,bars,continuity,firstBarTime:bars[0]?.t??null,lastBarTime:bars.at(-1)?.t??null,closedBarCount:bars.length,signature},evidenceArchive:archive,attributionLedger,attributionAudit:{...attributionAudit,checkedAt:runAtIso},collector:{version:AUTONOMOUS_HIGHER_TIMEFRAME_FORWARD_COLLECTOR_VERSION,status:continuity.gapCount?'warning-market-gap':'success',lastRunAt:runAtIso,workflowRunId:workflowRunId===null?null:String(workflowRunId),workflowRunAttempt:workflowRunAttempt===null?null:String(workflowRunAttempt),evaluatorCommit:HIGHER_TIMEFRAME_FORWARD_FROZEN_COMMIT,marketBarsAdded:mergedMarket.added,marketConflicts:[],incomingClosedBars:incoming.length,totalMarketBars:bars.length,prospectiveDecisionRecords:snapshot.decisions.length,prospectiveEvidenceRecords:snapshot.evidence.length,archivedDecisionRecords:archive.decisions.length,archivedEvidenceRecords:archive.evidence.length,archivedAttributionRecords:attributionLedger.records.length,browserRequired:false,paidApiRequired:false,replayAuditRequiredOnceProspectiveBarsExist:true,attributionLedgerRequired:true},audit:null};
  let audit;if(archive.observedBarTimes.length){audit=auditHigherTimeframeForwardDocument(document);if(!audit.pass)throw new Error(`htf-forward-replay-audit:${audit.errorCodes.join(',')}`);}else audit={version:HIGHER_TIMEFRAME_FORWARD_REPLAY_AUDIT_VERSION,status:'waiting',pass:false,reason:'no-post-freeze-closed-bar-yet',errorCount:0,errorCodes:[],checked:{marketBars:bars.length,observedBars:0,decisions:0,evidence:0}};
  document.audit={...audit,checkedAt:runAtIso};return {document,snapshot,audit,marketMerge:mergedMarket,attributionLedger,attributionAudit};
}
