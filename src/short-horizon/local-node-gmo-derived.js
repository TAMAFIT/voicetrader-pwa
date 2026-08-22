import path from 'node:path';
import crypto from 'node:crypto';

export const LOCAL_NODE_GMO_DERIVED_SCHEMA = 'voicetrader-local-gmo-derived-v1';
export const DERIVED_INTERVALS_MS = Object.freeze([1000, 5000, 60000]);

const round = (value, digits = 8) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};
const pad2 = (value) => String(value).padStart(2, '0');

export function floorBucketMs(timestampMs, intervalMs) {
  const ts = Number(timestampMs);
  const width = Number(intervalMs);
  if (!Number.isFinite(ts) || ts < 0) throw new Error('derived-timestamp-invalid');
  if (!DERIVED_INTERVALS_MS.includes(width)) throw new Error('derived-interval-unsupported');
  return Math.floor(ts / width) * width;
}

export function intervalLabel(intervalMs) {
  if (intervalMs === 1000) return '1s';
  if (intervalMs === 5000) return '5s';
  if (intervalMs === 60000) return '1m';
  throw new Error('derived-interval-unsupported');
}

export function boundaryContext(bucketStartMs) {
  const date = new Date(bucketStartMs);
  const second = date.getUTCSeconds();
  const minute = date.getUTCMinutes();
  const secondsIntoHour = minute * 60 + second;
  const from = (periodSeconds) => secondsIntoHour % periodSeconds;
  const to = (periodSeconds) => (periodSeconds - from(periodSeconds)) % periodSeconds;
  const jst = new Date(bucketStartMs + 9 * 60 * 60 * 1000);
  return {
    utc:{
      hour:date.getUTCHours(), minute, second,
      iso:new Date(bucketStartMs).toISOString(),
    },
    jst:{
      hour:jst.getUTCHours(), minute:jst.getUTCMinutes(), second:jst.getUTCSeconds(),
      date:`${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth()+1)}-${pad2(jst.getUTCDate())}`,
    },
    boundaries:{
      isMinuteBoundary:second === 0,
      is5mBoundary:second === 0 && minute % 5 === 0,
      is15mBoundary:second === 0 && minute % 15 === 0,
      is60mBoundary:second === 0 && minute === 0,
      secondsFrom5mBoundary:from(300), secondsTo5mBoundary:to(300),
      secondsFrom15mBoundary:from(900), secondsTo15mBoundary:to(900),
      secondsFrom60mBoundary:from(3600), secondsTo60mBoundary:to(3600),
    },
  };
}

function extractTick(record) {
  const received = Number(record?.capture?.receivedTimestampMs ?? record?.quote?.timing?.receivedTimestampMs);
  const bid = Number(record?.quote?.quote?.bid);
  const ask = Number(record?.quote?.quote?.ask);
  const mid = Number(record?.quote?.quote?.mid ?? ((bid + ask) / 2));
  const spread = Number(record?.quote?.quote?.spreadPriceUnits ?? (ask - bid));
  const spreadBps = Number(record?.quote?.quote?.spreadBps ?? (spread / mid * 10000));
  const latency = Number(record?.quote?.timing?.receiveMinusSourceMs);
  const status = record?.quote?.quote?.marketStatus;
  if (!Number.isFinite(received) || !(bid > 0) || !(ask >= bid) || !(mid > 0)) return null;
  return { record, received, bid, ask, mid, spread, spreadBps, latency:Number.isFinite(latency) ? latency : null, status };
}

function ohlc(values) {
  return {
    open:round(values[0]), high:round(Math.max(...values)), low:round(Math.min(...values)), close:round(values.at(-1)),
  };
}

function stats(values, digits = 8) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return { min:null, max:null, mean:null, close:null };
  return {
    min:round(Math.min(...clean), digits),
    max:round(Math.max(...clean), digits),
    mean:round(clean.reduce((a,b)=>a+b,0)/clean.length, digits),
    close:round(clean.at(-1), digits),
  };
}

function directionStats(values) {
  let up=0, down=0, flat=0;
  for (let i=1;i<values.length;i+=1) {
    if (values[i] > values[i-1]) up += 1;
    else if (values[i] < values[i-1]) down += 1;
    else flat += 1;
  }
  const directional = up + down;
  return { up, down, flat, balance:directional ? round((up-down)/directional, 6) : 0 };
}

export function aggregateQuoteBucket(records, intervalMs) {
  const ticks = records.map(extractTick).filter(Boolean).sort((a,b)=>a.received-b.received);
  if (!ticks.length) return null;
  const bucketStartMs = floorBucketMs(ticks[0].received, intervalMs);
  const bucketEndMs = bucketStartMs + intervalMs;
  const inBucket = ticks.filter((tick)=>tick.received >= bucketStartMs && tick.received < bucketEndMs);
  if (!inBucket.length) return null;
  if (inBucket.some((tick)=>floorBucketMs(tick.received, intervalMs) !== bucketStartMs)) throw new Error('derived-cross-bucket-input');

  const bids = inBucket.map((t)=>t.bid);
  const asks = inBucket.map((t)=>t.ask);
  const mids = inBucket.map((t)=>t.mid);
  const spreadPrice = inBucket.map((t)=>t.spread);
  const spreadBps = inBucket.map((t)=>t.spreadBps);
  const latencies = inBucket.map((t)=>t.latency).filter(Number.isFinite);
  const quoteIds = inBucket.map((t)=>String(t.record?.quote?.quoteId || '')).filter(Boolean);
  const sourceHash = crypto.createHash('sha256').update(quoteIds.join('\n')).digest('hex');
  const statuses = inBucket.map((t)=>t.status);
  const openCount = statuses.filter((v)=>v === 'OPEN').length;
  const closeCount = statuses.filter((v)=>v === 'CLOSE').length;

  const record = {
    schemaVersion:LOCAL_NODE_GMO_DERIVED_SCHEMA,
    bucketId:`gmo-fx|USDJPY|${intervalLabel(intervalMs)}|${bucketStartMs}`,
    instrument:'USDJPY',
    provider:'gmo-coin-fx-public-v1',
    interval:{ label:intervalLabel(intervalMs), milliseconds:intervalMs, bucketStartMs, bucketEndMs },
    timing:boundaryContext(bucketStartMs),
    price:{ bid:ohlc(bids), ask:ohlc(asks), mid:ohlc(mids) },
    spread:{ priceUnits:stats(spreadPrice,8), bps:stats(spreadBps,6) },
    activity:{
      quoteUpdates:inBucket.length,
      midDirection:directionStats(mids),
      bidDirection:directionStats(bids),
      askDirection:directionStats(asks),
      firstReceivedTimestampMs:inBucket[0].received,
      lastReceivedTimestampMs:inBucket.at(-1).received,
    },
    latencyMs:stats(latencies,3),
    marketStatus:{ openCount, closeCount, openRatio:round(openCount/inBucket.length,6), last:statuses.at(-1) ?? null },
    provenance:{
      rawQuoteCount:inBucket.length,
      firstQuoteId:quoteIds[0] || null,
      lastQuoteId:quoteIds.at(-1) || null,
      rawQuoteIdSha256:sourceHash,
      rawIsAuthoritative:true,
      derivedIsRebuildable:true,
    },
    semantics:{
      quoteDirectionBalanceIsOfi:false,
      orderBookObserved:false,
      tradesObserved:false,
      micropriceAvailable:false,
      decisionInputAuthorized:false,
      automaticPromotion:false,
    },
    runtimePolicy:{ googleCloudEnabled:false, cloudUploadEnabled:false, externalNetworkRequired:false },
  };
  validateDerivedRecord(record);
  return record;
}

export function validateDerivedRecord(record) {
  if (record?.schemaVersion !== LOCAL_NODE_GMO_DERIVED_SCHEMA) throw new Error('derived-schema-invalid');
  if (!record.bucketId || record.instrument !== 'USDJPY') throw new Error('derived-identity-invalid');
  if (!DERIVED_INTERVALS_MS.includes(record.interval?.milliseconds)) throw new Error('derived-interval-invalid');
  if (!(record.activity?.quoteUpdates >= 1)) throw new Error('derived-activity-invalid');
  if (record.provenance?.rawIsAuthoritative !== true || record.provenance?.derivedIsRebuildable !== true) throw new Error('derived-provenance-invalid');
  if (record.semantics?.quoteDirectionBalanceIsOfi !== false || record.semantics?.orderBookObserved !== false || record.semantics?.decisionInputAuthorized !== false) throw new Error('derived-semantics-invalid');
  if (record.runtimePolicy?.googleCloudEnabled !== false || record.runtimePolicy?.cloudUploadEnabled !== false || record.runtimePolicy?.externalNetworkRequired !== false) throw new Error('derived-cloud-policy-invalid');
  return true;
}

export function buildDerivedPath(rootDir, intervalMs, bucketStartMs) {
  const date = new Date(bucketStartMs);
  const year=String(date.getUTCFullYear());
  const month=pad2(date.getUTCMonth()+1);
  const day=pad2(date.getUTCDate());
  const hour=pad2(date.getUTCHours());
  return path.join(path.resolve(rootDir),'derived','gmo-fx','USDJPY','quote-bars',intervalLabel(intervalMs),year,month,day,`${hour}.ndjson`);
}
