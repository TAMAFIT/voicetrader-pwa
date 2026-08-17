import { runEthForwardSnapshot } from './eth-forward-runner.js';
import { ETH_FORWARD_EPOCH_ID, ETH_FORWARD_FROZEN_STRATEGY_COMMIT, ETH_FORWARD_SOURCE_IDS } from './eth-forward-epoch.js';
import { detectKnowledgeForwardMarketGaps } from './eth-forward-remote.js';

export const ETH_FORWARD_REPLAY_AUDIT_VERSION='eth-forward-replay-audit-0.1';
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(key=>key!=='dataSignature').sort().map(key=>[key,stable(value[key])]));return value;}
const canonical=value=>JSON.stringify(stable(value));
const sameArray=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function add(errors,code,detail={}){errors.push({code,...detail});}
function keyed(items,key,errors,duplicateCode){const map=new Map();for(const item of items||[]){const value=item?.[key];if(!value)continue;if(map.has(value))add(errors,duplicateCode,{key:value});else map.set(value,item);}return map;}
function compareMap(expected,actual,keyName,errors,prefix){for(const [key,item] of expected){const found=actual.get(key);if(!found)add(errors,`missing-expected-${prefix}`,{key});else if(canonical(item)!==canonical(found))add(errors,`${prefix}-semantic-mismatch`,{key});}for(const key of actual.keys())if(!expected.has(key))add(errors,`unexpected-${prefix}`,{key});}

export function auditEthForwardDocument(remoteDocument){
  const doc=remoteDocument||{},errors=[];
  if(doc.epochId!==ETH_FORWARD_EPOCH_ID)add(errors,'archive-epoch-mismatch',{actual:doc.epochId});
  if(doc.frozenStrategyCommit!==ETH_FORWARD_FROZEN_STRATEGY_COMMIT)add(errors,'archive-strategy-commit-mismatch',{actual:doc.frozenStrategyCommit});
  if(doc.market?.instrument!=='ETHUSD')add(errors,'market-instrument-mismatch',{actual:doc.market?.instrument});
  if(doc.evidenceArchive?.epochId!==ETH_FORWARD_EPOCH_ID)add(errors,'evidence-archive-epoch-mismatch',{actual:doc.evidenceArchive?.epochId});
  if(doc.collector?.strategyCommit&&doc.collector.strategyCommit!==ETH_FORWARD_FROZEN_STRATEGY_COMMIT)add(errors,'collector-strategy-commit-mismatch',{actual:doc.collector?.strategyCommit});
  if(doc.collector?.status!=='success')add(errors,'collector-status-not-success',{actual:doc.collector?.status});
  if((doc.collector?.marketConflicts||[]).length)add(errors,'market-conflicts-present',{count:doc.collector.marketConflicts.length});
  if((doc.evidenceArchive?.mergeConflicts||[]).length)add(errors,'evidence-merge-conflicts-present',{count:doc.evidenceArchive.mergeConflicts.length});
  const series=Array.isArray(doc.market?.bars)?doc.market.bars:[],continuity=detectKnowledgeForwardMarketGaps(series);if(!series.length)add(errors,'market-archive-empty');if(continuity.gapCount)add(errors,'market-4h-gap',{gapCount:continuity.gapCount});
  const observed=(doc.evidenceArchive?.observedBarTimes||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!observed.length)return {version:ETH_FORWARD_REPLAY_AUDIT_VERSION,status:errors.length?'fail':'waiting',pass:false,reason:errors.length?'pre-observation-integrity-failure':'no-post-freeze-closed-bar-yet',checked:{marketBars:series.length,observedBars:0,decisions:(doc.evidenceArchive?.decisions||[]).length,evidence:(doc.evidenceArchive?.evidence||[]).length,sources:ETH_FORWARD_SOURCE_IDS.length},errorCount:errors.length,errorCodes:[...new Set(errors.map(item=>item.code))],errors};
  const signature=doc.market?.signature||`eth-audit:${series[0]?.t||0}:${series.at(-1)?.t||0}:${series.length}`,expected=runEthForwardSnapshot({series,endIndex:series.length-1,dataSignature:signature});if(expected.status!=='complete'){add(errors,'frozen-runner-not-complete',{reason:expected.reason||expected.status});return {version:ETH_FORWARD_REPLAY_AUDIT_VERSION,status:'fail',pass:false,errorCount:errors.length,errorCodes:[...new Set(errors.map(item=>item.code))],errors};}
  const expectedObserved=[...(expected.observedBarTimes||[])].map(Number).sort((a,b)=>a-b);if(!sameArray(observed,expectedObserved))add(errors,'observed-bar-set-mismatch',{actualCount:observed.length,expectedCount:expectedObserved.length});
  const expectedDecisions=keyed(expected.decisions,'decisionKey',errors,'duplicate-expected-decision-key'),actualDecisions=keyed(doc.evidenceArchive?.decisions,'decisionKey',errors,'duplicate-decision-key');compareMap(expectedDecisions,actualDecisions,'decisionKey',errors,'decision');
  const expectedEvidence=keyed(expected.evidence,'evidenceKey',errors,'duplicate-expected-evidence-key'),actualEvidence=keyed(doc.evidenceArchive?.evidence,'evidenceKey',errors,'duplicate-evidence-key');compareMap(expectedEvidence,actualEvidence,'evidenceKey',errors,'evidence');
  const sourceIds=new Set((doc.evidenceArchive?.decisions||[]).map(item=>item.sourceId));for(const id of ETH_FORWARD_SOURCE_IDS)if(!sourceIds.has(id))add(errors,'source-decision-coverage-missing',{sourceId:id});
  for(const id of ETH_FORWARD_SOURCE_IDS){const trades=(doc.evidenceArchive?.evidence||[]).filter(item=>item.sourceId===id).sort((a,b)=>Number(a.entryIndex)-Number(b.entryIndex));for(let i=1;i<trades.length;i++)if(Number(trades[i].entryIndex)<=Number(trades[i-1].exitIndex))add(errors,'source-trade-overlap',{sourceId:id,previous:trades[i-1].evidenceKey,current:trades[i].evidenceKey});}
  return {version:ETH_FORWARD_REPLAY_AUDIT_VERSION,status:errors.length?'fail':'pass',pass:errors.length===0,checked:{marketBars:series.length,observedBars:observed.length,decisions:actualDecisions.size,evidence:actualEvidence.size,expectedDecisions:expectedDecisions.size,expectedEvidence:expectedEvidence.size,sources:ETH_FORWARD_SOURCE_IDS.length},errorCount:errors.length,errorCodes:[...new Set(errors.map(item=>item.code))],errors,methodology:{fullFrozenRunnerReplay:true,keySetEqualityRequired:true,dataSignatureIsCollectionProvenanceOnly:true,tradeEconomicsRecomputed:true,ethSpecificTuning:false,futureBarsForbidden:true,independentSourceNonOverlap:true,changesFrozenStrategy:false,usedByLiveDecisionEngine:false}};
}
