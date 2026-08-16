import { KNOWLEDGE_FORWARD_EPOCH_ID } from './knowledge-forward-epoch.js';
import { emptyKnowledgeForwardArchive } from './knowledge-forward-store.js';

export const KNOWLEDGE_FORWARD_REMOTE_VERSION = 'knowledge-forward-remote-0.1';
export const KNOWLEDGE_FORWARD_DATA_BRANCH = 'knowledge-forward-data';
export const KNOWLEDGE_FORWARD_DATA_PATH = 'data/knowledge-forward-001.json';
export const KNOWLEDGE_FORWARD_RAW_URL = 'https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/knowledge-forward-data/data/knowledge-forward-001.json';
export const KRAKEN_SPOT_BTCUSD_4H_URL = 'https://api.kraken.com/0/public/OHLC?pair=XXBTZUSD&interval=240';
export const FOUR_HOURS_SECONDS = 4 * 60 * 60;
export const FROZEN_KNOWLEDGE_EVALUATOR_COMMIT = '1af623dfa7df53618733050ff9edab5e3595a3d0';

const clone = value => JSON.parse(JSON.stringify(value));

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeKnowledgeForwardBar(value = {}) {
  const bar = {
    t: finiteNumber(value.t),
    o: finiteNumber(value.o),
    h: finiteNumber(value.h),
    l: finiteNumber(value.l),
    c: finiteNumber(value.c),
    volume: finiteNumber(value.volume) ?? 0,
    trades: finiteNumber(value.trades) ?? 0,
  };
  if (![bar.t,bar.o,bar.h,bar.l,bar.c].every(Number.isFinite)) return null;
  return bar;
}

export function normalizeKrakenSpot4H(payload, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (Array.isArray(payload?.error) && payload.error.length) throw new Error(`Kraken error: ${payload.error.join(', ')}`);
  const result = payload?.result || {};
  const pairKey = Object.keys(result).find(key => key !== 'last');
  const rows = pairKey ? result[pairKey] : null;
  if (!Array.isArray(rows)) throw new Error('Kraken OHLC payload missing candle array');
  const byTime = new Map();
  for (const row of rows) {
    const bar = normalizeKnowledgeForwardBar({
      t:row?.[0], o:row?.[1], h:row?.[2], l:row?.[3], c:row?.[4], volume:row?.[6] || 0, trades:row?.[7] || 0,
    });
    if (!bar || bar.t + FOUR_HOURS_SECONDS > Number(nowSeconds)) continue;
    byTime.set(bar.t,bar);
  }
  return [...byTime.values()].sort((a,b) => a.t - b.t);
}

function comparableBar(bar) {
  return JSON.stringify([bar.t,bar.o,bar.h,bar.l,bar.c,bar.volume,bar.trades]);
}

export function mergeKnowledgeForwardMarketBars(existingBars = [], incomingBars = []) {
  const existing = new Map();
  const conflicts = [];
  for (const raw of existingBars) {
    const bar = normalizeKnowledgeForwardBar(raw);
    if (bar) existing.set(bar.t,bar);
  }
  let added = 0;
  for (const raw of incomingBars) {
    const bar = normalizeKnowledgeForwardBar(raw);
    if (!bar) continue;
    const prior = existing.get(bar.t);
    if (!prior) {
      existing.set(bar.t,bar);
      added += 1;
      continue;
    }
    if (comparableBar(prior) !== comparableBar(bar)) {
      conflicts.push({ timestamp:bar.t, existing:prior, incoming:bar });
    }
  }
  const bars = [...existing.values()].sort((a,b) => a.t - b.t);
  return { bars, added, conflicts };
}

export function detectKnowledgeForwardMarketGaps(bars = []) {
  const times = [...new Set(bars.map(item => Number(item?.t)).filter(Number.isFinite))].sort((a,b)=>a-b);
  const missingBarTimes = [];
  for (let i=1;i<times.length;i++) {
    for (let expected=times[i-1]+FOUR_HOURS_SECONDS; expected<times[i]; expected+=FOUR_HOURS_SECONDS) missingBarTimes.push(expected);
  }
  return { barCount:times.length, gapCount:missingBarTimes.length, missingBarTimes };
}

export function emptyKnowledgeForwardRemoteDocument() {
  return {
    schemaVersion:KNOWLEDGE_FORWARD_REMOTE_VERSION,
    epochId:KNOWLEDGE_FORWARD_EPOCH_ID,
    generatedDataBranch:KNOWLEDGE_FORWARD_DATA_BRANCH,
    frozenEvaluatorCommit:FROZEN_KNOWLEDGE_EVALUATOR_COMMIT,
    market:{
      provider:'Kraken public OHLC',
      sourceId:'kraken-spot-btcusd-4h-v1',
      instrument:'BTCUSD',
      timeframeHours:4,
      intervalSeconds:FOUR_HOURS_SECONDS,
      bars:[],
      continuity:{barCount:0,gapCount:0,missingBarTimes:[]},
    },
    evidenceArchive:emptyKnowledgeForwardArchive(),
    collector:{
      version:'autonomous-knowledge-forward-collector-0.1',
      status:'initialized',
      lastRunAt:null,
      sourceFetchedAt:null,
      workflowRunId:null,
      workflowRunAttempt:null,
      evaluatorCommit:FROZEN_KNOWLEDGE_EVALUATOR_COMMIT,
      marketBarsAdded:0,
      marketConflicts:[],
    },
  };
}

export function normalizeKnowledgeForwardRemoteDocument(value) {
  const base = emptyKnowledgeForwardRemoteDocument();
  if (!value || value.epochId !== KNOWLEDGE_FORWARD_EPOCH_ID) return base;
  const mergedMarket = mergeKnowledgeForwardMarketBars([],value.market?.bars || []);
  return {
    ...base,
    ...clone(value),
    schemaVersion:KNOWLEDGE_FORWARD_REMOTE_VERSION,
    epochId:KNOWLEDGE_FORWARD_EPOCH_ID,
    frozenEvaluatorCommit:FROZEN_KNOWLEDGE_EVALUATOR_COMMIT,
    market:{
      ...base.market,
      ...(value.market || {}),
      bars:mergedMarket.bars,
      continuity:detectKnowledgeForwardMarketGaps(mergedMarket.bars),
    },
    evidenceArchive:value.evidenceArchive && value.evidenceArchive.epochId === KNOWLEDGE_FORWARD_EPOCH_ID
      ? clone(value.evidenceArchive)
      : emptyKnowledgeForwardArchive(),
    collector:{...base.collector,...(value.collector || {})},
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key,stableValue(value[key])]));
  }
  return value;
}

function canonicalRecord(record) {
  return JSON.stringify(stableValue(record));
}

export function mergeKnowledgeForwardEvidenceArchives(remoteArchive, localArchive) {
  const remote = remoteArchive?.epochId === KNOWLEDGE_FORWARD_EPOCH_ID ? clone(remoteArchive) : emptyKnowledgeForwardArchive();
  const local = localArchive?.epochId === KNOWLEDGE_FORWARD_EPOCH_ID ? clone(localArchive) : emptyKnowledgeForwardArchive();
  const conflicts = [];
  const mergeKeyed = (remoteItems,keyName,localItems) => {
    const map = new Map();
    for (const item of remoteItems || []) if (item?.[keyName]) map.set(item[keyName],clone(item));
    for (const item of localItems || []) {
      const key = item?.[keyName];
      if (!key) continue;
      const prior = map.get(key);
      if (!prior) map.set(key,clone(item));
      else if (canonicalRecord(prior) !== canonicalRecord(item)) conflicts.push({ type:keyName,key,remote:prior,local:item });
    }
    return [...map.values()];
  };
  const decisions = mergeKeyed(remote.decisions,'decisionKey',local.decisions)
    .sort((a,b)=>Number(a.candleTime)-Number(b.candleTime)||String(a.sourceId).localeCompare(String(b.sourceId)));
  const evidence = mergeKeyed(remote.evidence,'evidenceKey',local.evidence)
    .sort((a,b)=>Number(a.entryTime)-Number(b.entryTime)||String(a.sourceId).localeCompare(String(b.sourceId)));
  const observedBarTimes=[...new Set([...(remote.observedBarTimes||[]),...(local.observedBarTimes||[])].map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);
  const dataSignatures=[...new Set([...(remote.dataSignatures||[]),...(local.dataSignatures||[])].filter(Boolean))];
  return {
    archive:{...remote,observedBarTimes,dataSignatures,decisions,evidence,updatedAt:remote.updatedAt||local.updatedAt||null},
    conflicts,
    remoteAuthoritative:true,
  };
}

export async function fetchKnowledgeForwardRemoteDocument({ fetchImpl=fetch, url=KNOWLEDGE_FORWARD_RAW_URL, timeoutMs=5000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response = await fetchImpl(url,{method:'GET',headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});
    if (!response.ok) throw new Error(`remote archive HTTP ${response.status}`);
    const parsed = await response.json();
    if (parsed?.epochId !== KNOWLEDGE_FORWARD_EPOCH_ID) throw new Error('remote archive epoch mismatch');
    if (parsed?.frozenEvaluatorCommit !== FROZEN_KNOWLEDGE_EVALUATOR_COMMIT) throw new Error('remote archive evaluator commit mismatch');
    return { document:normalizeKnowledgeForwardRemoteDocument(parsed), error:null };
  } catch (error) {
    return { document:null, error:String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}
