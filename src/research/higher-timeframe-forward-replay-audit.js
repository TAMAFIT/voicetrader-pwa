import { runHigherTimeframeForwardSnapshot } from './higher-timeframe-forward-runner.js';
import { HIGHER_TIMEFRAME_FORWARD_EPOCH_ID } from './higher-timeframe-forward-epoch.js';
import { HIGHER_TIMEFRAME_FORWARD_FROZEN_COMMIT, detectKnowledgeForwardMarketGaps } from './higher-timeframe-forward-remote.js';

export const HIGHER_TIMEFRAME_FORWARD_REPLAY_AUDIT_VERSION='higher-timeframe-forward-replay-audit-0.1';
const approx=(a,b,t=.011)=>Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<=t;
const sameArray=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function add(errors,code,detail={}){errors.push({code,...detail});}
function mapBy(items,key){return new Map((items||[]).filter(item=>item?.[key]).map(item=>[item[key],item]));}

function compareDecision(expected,actual,errors){for(const field of ['epochId','sourceId','role','barIndex','candleTime','decision','observedProspectively','usedFutureOutcomeAtDecision'])if(expected?.[field]!==actual?.[field])add(errors,'decision-field-mismatch',{key:expected?.decisionKey,field,expected:expected?.[field],actual:actual?.[field]});}
function compareEvidence(expected,actual,errors){for(const field of ['epochId','sourceId','role','decision','side','entryIndex','exitIndex','entryTime','exitTime','holdingBars','costModelVersion','costUsesEntryBarInformationOnly','observedProspectively','futureOutcomeUsedByDecision'])if(expected?.[field]!==actual?.[field])add(errors,'evidence-field-mismatch',{key:expected?.evidenceKey,field,expected:expected?.[field],actual:actual?.[field]});for(const field of ['estimatedRoundTripCostBps','entryPrice','exitPrice','grossReturnBps','netReturnBps'])if(!approx(expected?.[field],actual?.[field],field.includes('Price')?.000001:.011))add(errors,'evidence-value-mismatch',{key:expected?.evidenceKey,field,expected:expected?.[field],actual:actual?.[field]});}

export function auditHigherTimeframeForwardDocument(remoteDocument){
  const errors=[];const doc=remoteDocument||{};
  if(doc.epochId!==HIGHER_TIMEFRAME_FORWARD_EPOCH_ID)add(errors,'archive-epoch-mismatch',{actual:doc.epochId});
  if(doc.frozenEvaluatorCommit!==HIGHER_TIMEFRAME_FORWARD_FROZEN_COMMIT)add(errors,'archive-evaluator-mismatch',{actual:doc.frozenEvaluatorCommit});
  if(doc.evidenceArchive?.epochId!==HIGHER_TIMEFRAME_FORWARD_EPOCH_ID)add(errors,'evidence-archive-epoch-mismatch',{actual:doc.evidenceArchive?.epochId});
  if(doc.collector?.evaluatorCommit&&doc.collector.evaluatorCommit!==HIGHER_TIMEFRAME_FORWARD_FROZEN_COMMIT)add(errors,'collector-evaluator-mismatch',{actual:doc.collector?.evaluatorCommit});
  if(doc.collector?.status!=='success')add(errors,'collector-status-not-success',{actual:doc.collector?.status});
  if((doc.collector?.marketConflicts||[]).length)add(errors,'market-conflicts-present',{count:doc.collector.marketConflicts.length});
  if((doc.evidenceArchive?.mergeConflicts||[]).length)add(errors,'evidence-merge-conflicts-present',{count:doc.evidenceArchive.mergeConflicts.length});
  const series=Array.isArray(doc.market?.bars)?doc.market.bars:[];const continuity=detectKnowledgeForwardMarketGaps(series);if(!series.length)add(errors,'market-archive-empty');if(continuity.gapCount)add(errors,'market-4h-gap',{gapCount:continuity.gapCount});
  const observed=(doc.evidenceArchive?.observedBarTimes||[]).map(Number).filter(Number.isFinite);
  if(!observed.length)return {version:HIGHER_TIMEFRAME_FORWARD_REPLAY_AUDIT_VERSION,status:errors.length?'fail':'waiting',pass:false,reason:errors.length?'pre-observation-integrity-failure':'no-post-freeze-closed-bar-yet',checked:{marketBars:series.length,observedBars:0,decisions:(doc.evidenceArchive?.decisions||[]).length,evidence:(doc.evidenceArchive?.evidence||[]).length},errorCount:errors.length,errorCodes:[...new Set(errors.map(item=>item.code))],errors};
  const signature=doc.market?.signature||`audit:${series[0]?.t||0}:${series.at(-1)?.t||0}:${series.length}`;const expected=runHigherTimeframeForwardSnapshot({series,endIndex:series.length-1,dataSignature:signature});if(expected.status!=='complete'){add(errors,'frozen-runner-not-complete',{reason:expected.reason||expected.status});return {version:HIGHER_TIMEFRAME_FORWARD_REPLAY_AUDIT_VERSION,status:'fail',pass:false,errorCount:errors.length,errorCodes:[...new Set(errors.map(item=>item.code))],errors};}
  if(!sameArray(observed,expected.observedBarTimes))add(errors,'observed-bar-set-mismatch',{actualCount:observed.length,expectedCount:expected.observedBarTimes.length});
  const expectedDecisions=mapBy(expected.decisions,'decisionKey'),actualDecisions=mapBy(doc.evidenceArchive?.decisions,'decisionKey');
  if(expectedDecisions.size!==(doc.evidenceArchive?.decisions||[]).length)add(errors,'duplicate-decision-key');
  for(const [key,item] of expectedDecisions){const actual=actualDecisions.get(key);if(!actual)add(errors,'missing-expected-decision',{key});else compareDecision(item,actual,errors);}for(const key of actualDecisions.keys())if(!expectedDecisions.has(key))add(errors,'unexpected-decision',{key});
  const expectedEvidence=mapBy(expected.evidence,'evidenceKey'),actualEvidence=mapBy(doc.evidenceArchive?.evidence,'evidenceKey');
  if(actualEvidence.size!==(doc.evidenceArchive?.evidence||[]).length)add(errors,'duplicate-evidence-key');
  for(const [key,item] of expectedEvidence){const actual=actualEvidence.get(key);if(!actual)add(errors,'missing-expected-evidence',{key});else compareEvidence(item,actual,errors);}for(const key of actualEvidence.keys())if(!expectedEvidence.has(key))add(errors,'unexpected-evidence',{key});
  return {version:HIGHER_TIMEFRAME_FORWARD_REPLAY_AUDIT_VERSION,status:errors.length?'fail':'pass',pass:errors.length===0,checked:{marketBars:series.length,observedBars:observed.length,decisions:actualDecisions.size,evidence:actualEvidence.size,expectedDecisions:expectedDecisions.size,expectedEvidence:expectedEvidence.size},errorCount:errors.length,errorCodes:[...new Set(errors.map(item=>item.code))],errors,methodology:{fullFrozenRunnerReplay:true,keySetEqualityRequired:true,tradeEconomicsRecomputed:true,fullyClosedDailyContextRecomputed:true,futureFourHourUseForbidden:true,downstreamAuditOnly:true,changesFrozenEngine:false,usedByLiveDecisionEngine:false}};
}
