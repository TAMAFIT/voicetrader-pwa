import path from 'node:path';
import crypto from 'node:crypto';

export const KRAKEN_SPOT_V2_WS_URL = 'wss://ws.kraken.com/v2';
export const KRAKEN_LOCAL_WIRE_SCHEMA = 'voicetrader-kraken-wire-meta-v1';
export const KRAKEN_LOCAL_SYMBOLS = Object.freeze(['BTC/USD','ETH/USD']);
export const KRAKEN_BOOK_DEPTH = 10;

const pad2 = (value) => String(value).padStart(2,'0');

export function buildKrakenSubscriptions() {
  return [
    { method:'subscribe', params:{ channel:'book', symbol:[...KRAKEN_LOCAL_SYMBOLS], depth:KRAKEN_BOOK_DEPTH, snapshot:true }, req_id:5101 },
    { method:'subscribe', params:{ channel:'trade', symbol:[...KRAKEN_LOCAL_SYMBOLS], snapshot:false }, req_id:5102 },
  ];
}

export function buildKrakenWirePaths(rootDir, receivedTimestampMs) {
  const d=new Date(Number(receivedTimestampMs));
  if (!Number.isFinite(d.getTime())) throw new Error('kraken-received-time-invalid');
  const year=String(d.getUTCFullYear()); const month=pad2(d.getUTCMonth()+1); const day=pad2(d.getUTCDate()); const hour=pad2(d.getUTCHours());
  const dir=path.join(path.resolve(rootDir),'raw','kraken','spot-v2',year,month,day);
  return {
    dir,
    wireFile:path.join(dir,`${hour}.wire.jsonseq`),
    metaFile:path.join(dir,`${hour}.meta.ndjson`),
    stateDir:path.join(path.resolve(rootDir),'state'),
    healthFile:path.join(path.resolve(rootDir),'state','kraken-microstructure-health.json'),
    logDir:path.join(path.resolve(rootDir),'logs','kraken'),
  };
}

export function frameJsonSequence(rawText) {
  const raw=String(rawText ?? '');
  if (!raw.length) throw new Error('kraken-wire-empty');
  return Buffer.concat([Buffer.from([0x1e]),Buffer.from(raw,'utf8'),Buffer.from('\n','utf8')]);
}

export function classifyKrakenWire(rawText) {
  const raw=String(rawText ?? '');
  const classification={ parseOk:false, channel:null, type:null, symbols:[], isBook:false, isTrade:false, isHeartbeat:false, isAck:false };
  try {
    const payload=JSON.parse(raw);
    classification.parseOk=true;
    classification.channel=typeof payload?.channel === 'string' ? payload.channel : null;
    classification.type=typeof payload?.type === 'string' ? payload.type : null;
    classification.isBook=classification.channel === 'book';
    classification.isTrade=classification.channel === 'trade';
    classification.isHeartbeat=classification.channel === 'heartbeat';
    classification.isAck=payload?.method === 'subscribe' || payload?.method === 'pong' || typeof payload?.success === 'boolean';
    const symbols=new Set();
    if (typeof payload?.symbol === 'string') symbols.add(payload.symbol);
    if (typeof payload?.result?.symbol === 'string') symbols.add(payload.result.symbol);
    if (Array.isArray(payload?.data)) {
      for (const item of payload.data) if (typeof item?.symbol === 'string') symbols.add(item.symbol);
    }
    classification.symbols=[...symbols].filter((symbol)=>KRAKEN_LOCAL_SYMBOLS.includes(symbol));
  } catch {}
  return classification;
}

export function buildKrakenWireMeta(rawText,{receivedTimestampMs=Date.now(),connectionId,sequence}={}) {
  const raw=String(rawText ?? '');
  const received=Number(receivedTimestampMs);
  const seq=Number(sequence);
  if (!Number.isFinite(received) || received < 0) throw new Error('kraken-received-time-invalid');
  if (!Number.isInteger(seq) || seq < 1) throw new Error('kraken-sequence-invalid');
  const classification=classifyKrakenWire(raw);
  const meta={
    schemaVersion:KRAKEN_LOCAL_WIRE_SCHEMA,
    sequence:seq,
    connectionId:String(connectionId || ''),
    receivedTimestampMs:received,
    byteLength:Buffer.byteLength(raw,'utf8'),
    sourceSha256:crypto.createHash('sha256').update(raw,'utf8').digest('hex'),
    ...classification,
    provider:{ id:'kraken-spot-websocket-v2', endpoint:KRAKEN_SPOT_V2_WS_URL, authenticationRequired:false },
    semantics:{ exactProviderTextPreserved:true, orderBookSynchronizationVerified:false, checksumObserved:classification.isBook, checksumVerified:false, ofiAvailable:false, micropriceAvailable:false },
    governance:{ readOnlyObservation:true, orderSubmission:false, realMoneyRouting:false, automaticPromotion:false },
    runtimePolicy:{ googleCloudEnabled:false, cloudUploadEnabled:false, githubActionsRequired:false },
  };
  validateKrakenWireMeta(meta);
  return meta;
}

export function validateKrakenWireMeta(meta) {
  if (meta?.schemaVersion !== KRAKEN_LOCAL_WIRE_SCHEMA) throw new Error('kraken-meta-schema-invalid');
  if (!Number.isInteger(meta?.sequence) || meta.sequence < 1) throw new Error('kraken-meta-sequence-invalid');
  if (!Number.isFinite(meta?.receivedTimestampMs)) throw new Error('kraken-meta-time-invalid');
  if (meta.provider?.endpoint !== KRAKEN_SPOT_V2_WS_URL || meta.provider?.authenticationRequired !== false) throw new Error('kraken-provider-contract-invalid');
  if (meta.semantics?.exactProviderTextPreserved !== true || meta.semantics?.orderBookSynchronizationVerified !== false || meta.semantics?.ofiAvailable !== false) throw new Error('kraken-semantic-claim-invalid');
  if (meta.governance?.orderSubmission !== false || meta.governance?.realMoneyRouting !== false) throw new Error('kraken-execution-claim-invalid');
  if (meta.runtimePolicy?.googleCloudEnabled !== false || meta.runtimePolicy?.cloudUploadEnabled !== false) throw new Error('kraken-cloud-policy-invalid');
  return true;
}
