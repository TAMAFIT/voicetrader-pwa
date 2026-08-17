import { HIGHER_TIMEFRAME_FORWARD_BENCHMARK_ID, HIGHER_TIMEFRAME_FORWARD_EPOCH_ID, HIGHER_TIMEFRAME_FORWARD_SOURCE_ID } from './higher-timeframe-forward-epoch.js';

export const HIGHER_TIMEFRAME_FORWARD_STORE_VERSION='higher-timeframe-forward-store-0.1';
export const HIGHER_TIMEFRAME_FORWARD_LOCAL_KEY='voicetrader-htf-forward-evidence-v1';
const clone=value=>JSON.parse(JSON.stringify(value));
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
const canonical=value=>JSON.stringify(stable(value));
// dataSignature describes the collector/archive snapshot that carried a record. It legitimately
// changes when later market bars are appended, so it is provenance rather than record semantics.
function semanticRecord(value){if(!value||typeof value!=='object')return value;const copy=clone(value);delete copy.dataSignature;return copy;}
const semanticCanonical=value=>canonical(semanticRecord(value));

export function emptyHigherTimeframeForwardArchive(){return {archiveVersion:HIGHER_TIMEFRAME_FORWARD_STORE_VERSION,epochId:HIGHER_TIMEFRAME_FORWARD_EPOCH_ID,observedBarTimes:[],dataSignatures:[],decisions:[],evidence:[],mergeConflicts:[],updatedAt:null};}
export function normalizeHigherTimeframeForwardArchive(value){const base=emptyHigherTimeframeForwardArchive();if(!value||value.epochId!==HIGHER_TIMEFRAME_FORWARD_EPOCH_ID)return base;return {...base,...clone(value),archiveVersion:HIGHER_TIMEFRAME_FORWARD_STORE_VERSION,epochId:HIGHER_TIMEFRAME_FORWARD_EPOCH_ID,observedBarTimes:[...new Set((value.observedBarTimes||[]).map(Number).filter(Number.isFinite))].sort((a,b)=>a-b),dataSignatures:[...new Set((value.dataSignatures||[]).filter(Boolean))],decisions:Array.isArray(value.decisions)?clone(value.decisions):[],evidence:Array.isArray(value.evidence)?clone(value.evidence):[],mergeConflicts:Array.isArray(value.mergeConflicts)?clone(value.mergeConflicts):[]};}

function mergeKeyed(existing,incoming,keyName,conflicts){const map=new Map();for(const item of existing||[])if(item?.[keyName])map.set(item[keyName],clone(item));for(const item of incoming||[]){const key=item?.[keyName];if(!key)continue;const prior=map.get(key);if(!prior)map.set(key,clone(item));else if(semanticCanonical(prior)!==semanticCanonical(item))conflicts.push({type:keyName,key,existing:prior,incoming:item});}return [...map.values()];}

export function mergeHigherTimeframeForwardArchive(existingArchive,snapshot,{updatedAt=new Date().toISOString()}={}){
  const existing=normalizeHigherTimeframeForwardArchive(existingArchive);if(snapshot?.status!=='complete')return existing;const conflicts=[];
  const decisions=mergeKeyed(existing.decisions,snapshot.decisions,'decisionKey',conflicts).sort((a,b)=>Number(a.candleTime)-Number(b.candleTime)||String(a.sourceId).localeCompare(String(b.sourceId)));
  const evidence=mergeKeyed(existing.evidence,snapshot.evidence,'evidenceKey',conflicts).sort((a,b)=>Number(a.entryTime)-Number(b.entryTime)||String(a.sourceId).localeCompare(String(b.sourceId)));
  return {...existing,observedBarTimes:[...new Set([...existing.observedBarTimes,...(snapshot.observedBarTimes||[])].map(Number).filter(Number.isFinite))].sort((a,b)=>a-b),dataSignatures:[...new Set([...existing.dataSignatures,snapshot.dataSignature].filter(Boolean))],decisions,evidence,mergeConflicts:[...existing.mergeConflicts,...conflicts],updatedAt};
}

function sourceSummary(archive,sourceId){const decisions=archive.decisions.filter(item=>item.sourceId===sourceId),trades=archive.evidence.filter(item=>item.sourceId===sourceId).sort((a,b)=>Number(a.entryTime)-Number(b.entryTime));let equity=1,wins=0,gp=0,gl=0;for(const trade of trades){const net=Number(trade.netReturnBps);if(!Number.isFinite(net))continue;if(net>0){wins++;gp+=net;}if(net<0)gl+=Math.abs(net);equity*=Math.max(.000001,1+net/10000);}return {decisionObservations:decisions.length,trades:trades.length,returnPct:(equity-1)*100,avgNetBps:trades.length?trades.reduce((s,t)=>s+Number(t.netReturnBps||0),0)/trades.length:0,winRatePct:trades.length?wins/trades.length*100:0,profitFactor:gl>0?gp/gl:gp>0?null:null,lastEvidenceExit:trades.length?Number(trades.at(-1).exitTime):null};}
export function summarizeHigherTimeframeForwardArchive(value){const archive=normalizeHigherTimeframeForwardArchive(value);return {observedBars:archive.observedBarTimes.length,decisionCount:archive.decisions.length,evidenceCount:archive.evidence.length,lastObservedBar:archive.observedBarTimes.at(-1)||null,mergeConflictCount:archive.mergeConflicts.length,sources:{[HIGHER_TIMEFRAME_FORWARD_SOURCE_ID]:sourceSummary(archive,HIGHER_TIMEFRAME_FORWARD_SOURCE_ID),[HIGHER_TIMEFRAME_FORWARD_BENCHMARK_ID]:sourceSummary(archive,HIGHER_TIMEFRAME_FORWARD_BENCHMARK_ID)}};}
export function loadHigherTimeframeForwardArchive(){try{return normalizeHigherTimeframeForwardArchive(JSON.parse(localStorage.getItem(HIGHER_TIMEFRAME_FORWARD_LOCAL_KEY)||'null'));}catch{return emptyHigherTimeframeForwardArchive();}}
export function saveHigherTimeframeForwardArchive(value){const archive=normalizeHigherTimeframeForwardArchive(value);try{localStorage.setItem(HIGHER_TIMEFRAME_FORWARD_LOCAL_KEY,JSON.stringify(archive));}catch{}return archive;}
