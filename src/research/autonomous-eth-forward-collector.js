import { runEthForwardSnapshot } from './eth-forward-runner.js';
import { mergeEthForwardArchive } from './eth-forward-store.js';
import { auditEthForwardDocument, ETH_FORWARD_REPLAY_AUDIT_VERSION } from './eth-forward-replay-audit.js';
import {
  ETH_FORWARD_KRAKEN_URL,
  detectKnowledgeForwardMarketGaps,
  emptyEthForwardRemoteDocument,
  mergeKnowledgeForwardMarketBars,
  normalizeEthForwardRemoteDocument,
  normalizeKrakenSpot4H,
} from './eth-forward-remote.js';
import { ETH_FORWARD_EPOCH_ID, ETH_FORWARD_FROZEN_STRATEGY_COMMIT } from './eth-forward-epoch.js';

export const AUTONOMOUS_ETH_FORWARD_COLLECTOR_VERSION='autonomous-eth-forward-collector-0.1';
function marketSignature(bars=[]){return bars.length?`kraken-spot-ethusd-4h-v1:${bars[0].t}:${bars.at(-1).t}:${bars.length}`:'kraken-spot-ethusd-4h-v1:empty';}
export async function fetchEthForwardKraken({fetchImpl=fetch,nowSeconds=Math.floor(Date.now()/1000)}={}){const response=await fetchImpl(ETH_FORWARD_KRAKEN_URL,{method:'GET',headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`Kraken ETH OHLC HTTP ${response.status}`);return normalizeKrakenSpot4H(await response.json(),nowSeconds);}

export async function collectEthForwardAutonomously({existingDocument=emptyEthForwardRemoteDocument(),fetchImpl=fetch,nowSeconds=Math.floor(Date.now()/1000),runAtIso=new Date().toISOString(),workflowRunId=null,workflowRunAttempt=null}={}){
  if(existingDocument?.epochId&&existingDocument.epochId!==ETH_FORWARD_EPOCH_ID)throw new Error('eth collector existing epoch mismatch');
  if(existingDocument?.frozenStrategyCommit&&existingDocument.frozenStrategyCommit!==ETH_FORWARD_FROZEN_STRATEGY_COMMIT)throw new Error('eth collector existing strategy commit mismatch');
  const existing=normalizeEthForwardRemoteDocument(existingDocument);
  const incoming=await fetchEthForwardKraken({fetchImpl,nowSeconds});if(!incoming.length)throw new Error('Kraken returned no closed ETH/USD 4H bars');
  const mergedMarket=mergeKnowledgeForwardMarketBars(existing.market.bars,incoming);if(mergedMarket.conflicts.length)throw new Error(`eth-market-bar-conflict:${mergedMarket.conflicts.slice(0,5).map(item=>item.timestamp).join(',')}`);
  const bars=mergedMarket.bars,signature=marketSignature(bars),snapshot=runEthForwardSnapshot({series:bars,endIndex:bars.length-1,dataSignature:signature});if(snapshot.status!=='complete')throw new Error(`eth-forward-evaluator:${snapshot.reason||snapshot.status}`);
  const archive=mergeEthForwardArchive(existing.evidenceArchive,snapshot,{updatedAt:runAtIso});if(archive.mergeConflicts.length)throw new Error(`eth-forward-evidence-conflict:${archive.mergeConflicts.length}`);
  const continuity=detectKnowledgeForwardMarketGaps(bars);
  const document={...existing,frozenStrategyCommit:ETH_FORWARD_FROZEN_STRATEGY_COMMIT,market:{...existing.market,bars,continuity,signature,firstBarTime:bars[0]?.t??null,lastBarTime:bars.at(-1)?.t??null,closedBarCount:bars.length},evidenceArchive:archive,collector:{version:AUTONOMOUS_ETH_FORWARD_COLLECTOR_VERSION,status:continuity.gapCount?'warning-market-gap':'success',lastRunAt:runAtIso,workflowRunId:workflowRunId===null?null:String(workflowRunId),workflowRunAttempt:workflowRunAttempt===null?null:String(workflowRunAttempt),strategyCommit:ETH_FORWARD_FROZEN_STRATEGY_COMMIT,marketBarsAdded:mergedMarket.added,marketConflicts:[],incomingClosedBars:incoming.length,totalMarketBars:bars.length,prospectiveDecisionRecords:snapshot.decisions.length,prospectiveEvidenceRecords:snapshot.evidence.length,archivedDecisionRecords:archive.decisions.length,archivedEvidenceRecords:archive.evidence.length,browserRequired:false,paidApiRequired:false,replayAuditRequiredOnceProspectiveBarsExist:true},audit:null};
  let audit;if(archive.observedBarTimes.length){audit=auditEthForwardDocument(document);if(!audit.pass)throw new Error(`eth-forward-replay-audit:${audit.errorCodes.join(',')}`);}else audit={version:ETH_FORWARD_REPLAY_AUDIT_VERSION,status:'waiting',pass:false,reason:'no-post-freeze-closed-bar-yet',errorCount:0,errorCodes:[],checked:{marketBars:bars.length,observedBars:0,decisions:0,evidence:0,sources:6}};
  document.audit={...audit,checkedAt:runAtIso};return {document,snapshot,audit,marketMerge:mergedMarket};
}
