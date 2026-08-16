import { KNOWLEDGE_FORWARD_EPOCH, KNOWLEDGE_FORWARD_EPOCH_ID } from './knowledge-forward-epoch.js';
import { detectKnowledgeForwardBarGaps } from './knowledge-forward-runner.js';

export const KNOWLEDGE_FORWARD_STORE_VERSION = 'knowledge-forward-store-0.1';
export const KNOWLEDGE_FORWARD_STORAGE_KEY = 'voicetrader-knowledge-forward-evidence-v1';

const clone = value => JSON.parse(JSON.stringify(value));
const round = (value,digits=2)=>{const n=Number(value);if(!Number.isFinite(n))return null;const s=10**digits;return Math.round(n*s)/s;};

export function emptyKnowledgeForwardArchive() {
  return {
    archiveVersion:KNOWLEDGE_FORWARD_STORE_VERSION,
    epochId:KNOWLEDGE_FORWARD_EPOCH_ID,
    epoch:KNOWLEDGE_FORWARD_EPOCH,
    observedBarTimes:[],
    dataSignatures:[],
    decisions:[],
    evidence:[],
    updatedAt:null,
  };
}

function normalizeArchive(value) {
  const base=emptyKnowledgeForwardArchive();
  if(!value||value.epochId!==KNOWLEDGE_FORWARD_EPOCH_ID)return base;
  return {
    ...base,
    observedBarTimes:Array.isArray(value.observedBarTimes)?value.observedBarTimes:[],
    dataSignatures:Array.isArray(value.dataSignatures)?value.dataSignatures:[],
    decisions:Array.isArray(value.decisions)?value.decisions:[],
    evidence:Array.isArray(value.evidence)?value.evidence:[],
    updatedAt:value.updatedAt||null,
  };
}

export function loadKnowledgeForwardArchive(storage=globalThis?.localStorage) {
  if(!storage?.getItem)return emptyKnowledgeForwardArchive();
  try{return normalizeArchive(JSON.parse(storage.getItem(KNOWLEDGE_FORWARD_STORAGE_KEY)||'null'));}
  catch{return emptyKnowledgeForwardArchive();}
}

export function mergeKnowledgeForwardArchive(archive,snapshot,{updatedAt=new Date().toISOString()}={}) {
  const current=normalizeArchive(archive);
  if(!snapshot||snapshot.status!=='complete'||snapshot.epoch?.id!==KNOWLEDGE_FORWARD_EPOCH_ID)return current;
  const decisionMap=new Map(current.decisions.map(item=>[item.decisionKey,item]));
  for(const item of snapshot.decisions||[])if(item?.decisionKey&&!decisionMap.has(item.decisionKey))decisionMap.set(item.decisionKey,clone(item));
  const evidenceMap=new Map(current.evidence.map(item=>[item.evidenceKey,item]));
  for(const item of snapshot.evidence||[])if(item?.evidenceKey&&!evidenceMap.has(item.evidenceKey))evidenceMap.set(item.evidenceKey,clone(item));
  const observedBarTimes=[...new Set([...(current.observedBarTimes||[]),...(snapshot.observedBarTimes||[])].map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);
  const dataSignatures=[...new Set([...(current.dataSignatures||[]),snapshot.dataSignature].filter(Boolean))];
  return {
    ...current,
    observedBarTimes,
    dataSignatures,
    decisions:[...decisionMap.values()].sort((a,b)=>Number(a.candleTime)-Number(b.candleTime)||String(a.sourceId).localeCompare(String(b.sourceId))),
    evidence:[...evidenceMap.values()].sort((a,b)=>Number(a.entryTime)-Number(b.entryTime)||String(a.sourceId).localeCompare(String(b.sourceId))),
    updatedAt,
  };
}

export function saveKnowledgeForwardArchive(archive,storage=globalThis?.localStorage) {
  if(!storage?.setItem)return false;
  storage.setItem(KNOWLEDGE_FORWARD_STORAGE_KEY,JSON.stringify(normalizeArchive(archive)));
  return true;
}

function summarizeEvidence(items=[]) {
  let equity=1,peak=1,maxDrawdown=0,wins=0,grossProfit=0,grossLoss=0;
  for(const trade of items){const net=Number(trade.netReturnBps||0);if(net>0){wins++;grossProfit+=net;}if(net<0)grossLoss+=Math.abs(net);equity*=Math.max(.000001,1+net/10000);peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak>0?(peak-equity)/peak:0);}
  const count=items.length;
  return {
    trades:count,
    returnPct:round((equity-1)*100),
    avgNetBps:count?round(items.reduce((s,x)=>s+Number(x.netReturnBps||0),0)/count):0,
    winRatePct:count?round(wins/count*100,1):0,
    profitFactor:grossLoss>0?round(grossProfit/grossLoss):null,
    maxDrawdownPct:round(maxDrawdown*100),
  };
}

export function summarizeKnowledgeForwardArchive(archive) {
  const normalized=normalizeArchive(archive);
  const sourceIds=['champion-001','candidate-wave1-reference','candidate-playbook-reference','candidate-consensus','candidate-playbook-wave1-veto'];
  const sources=Object.fromEntries(sourceIds.map(sourceId=>{
    const evidence=normalized.evidence.filter(item=>item.sourceId===sourceId);
    const decisions=normalized.decisions.filter(item=>item.sourceId===sourceId);
    return [sourceId,{
      sourceId,
      role:sourceId==='champion-001'?'benchmark':'candidate',
      decisionObservations:decisions.length,
      entryDecisions:decisions.filter(item=>item.decision!=='NO_ENTRY').length,
      ...summarizeEvidence(evidence),
      lastEvidenceExit:evidence.length?Math.max(...evidence.map(x=>Number(x.exitTime)||0)):null,
    }];
  }));
  const continuity=detectKnowledgeForwardBarGaps(normalized.observedBarTimes);
  return {
    epochId:normalized.epochId,
    observedBars:normalized.observedBarTimes.length,
    evidenceCount:normalized.evidence.length,
    decisionCount:normalized.decisions.length,
    lastObservedBar:normalized.observedBarTimes.length?normalized.observedBarTimes.at(-1):null,
    continuity,
    sourceCount:Object.keys(sources).length,
    sources,
    updatedAt:normalized.updatedAt,
    localBrowserArchive:true,
    serverDurable:false,
  };
}
