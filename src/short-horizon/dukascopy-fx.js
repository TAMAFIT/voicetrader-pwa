import { buildClosedOhlcMarketEvent } from './market-event.js';

export const SHORT_HORIZON_DUKASCOPY_PROVIDER_VERSION = 'short-horizon-dukascopy-fx-v1';
export const DUKASCOPY_NODE_VERSION = '1.50.0';

export const SHORT_HORIZON_FX_STREAMS = Object.freeze([
  Object.freeze({
    id:'USDJPY-1m', assetClass:'fx', instrument:'USDJPY', venue:'dukascopy',
    timeframeMinutes:1, expectedContinuity:'sessioned',
  }),
  Object.freeze({
    id:'USDJPY-5m', assetClass:'fx', instrument:'USDJPY', venue:'dukascopy',
    timeframeMinutes:5, expectedContinuity:'sessioned',
  }),
]);

const SOURCE_ID_M1 = 'dukascopy-public-datafeed-usdjpy-bid-m1-v1';
const SOURCE_ID_5M = 'dukascopy-public-datafeed-usdjpy-bid-derived-5m-v1';

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`invalid-dukascopy-${name}`);
  return number;
}

function normalizePayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (typeof payload === 'string') {
    const parsed = JSON.parse(payload);
    if (Array.isArray(parsed)) return parsed;
  }
  throw new Error('invalid-dukascopy-payload');
}

export function normalizeDukascopyUsdJpyM1(rows, {
  receivedTimestampMs = Date.now(),
  nowMs = Date.now(),
} = {}) {
  const cutoff = Number(nowMs) - 60_000;
  return normalizePayload(rows)
    .map((row) => ({
      timestamp: finite(row?.timestamp, 'timestamp'),
      open: finite(row?.open, 'open'),
      high: finite(row?.high, 'high'),
      low: finite(row?.low, 'low'),
      close: finite(row?.close, 'close'),
      volume: finite(row?.volume ?? 0, 'volume'),
    }))
    .filter((row) => row.timestamp <= cutoff)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((row) => buildClosedOhlcMarketEvent({
      assetClass:'fx', instrument:'USDJPY', venue:'dukascopy', timeframeMinutes:1,
      sourceTimestampMs:row.timestamp, receivedTimestampMs,
      open:row.open, high:row.high, low:row.low, close:row.close,
      volume:row.volume, trades:0, sourceId:SOURCE_ID_M1,
    }));
}

export function aggregateM1Events(events, timeframeMinutes = 5) {
  const target = Number(timeframeMinutes);
  if (!Number.isInteger(target) || target <= 1) throw new Error('invalid-fx-aggregate-timeframe');
  const intervalMs = target * 60_000;
  const groups = new Map();

  for (const event of events) {
    if (event.instrument !== 'USDJPY' || event.venue !== 'dukascopy' || event.timeframeMinutes !== 1) {
      throw new Error('invalid-fx-aggregate-source');
    }
    const bucket = Math.floor(event.sourceTimestampMs / intervalMs) * intervalMs;
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(event);
  }

  const aggregated = [];
  for (const [bucket, membersUnsorted] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const members = [...membersUnsorted].sort((a, b) => a.sourceTimestampMs - b.sourceTimestampMs);
    if (members.length !== target) continue;
    let complete = true;
    for (let i = 0; i < target; i += 1) {
      if (members[i].sourceTimestampMs !== bucket + i * 60_000) {
        complete = false;
        break;
      }
    }
    if (!complete) continue;

    aggregated.push(buildClosedOhlcMarketEvent({
      assetClass:'fx', instrument:'USDJPY', venue:'dukascopy', timeframeMinutes:target,
      sourceTimestampMs:bucket,
      receivedTimestampMs:Math.max(...members.map((event) => event.receivedTimestampMs)),
      open:members[0].open,
      high:Math.max(...members.map((event) => event.high)),
      low:Math.min(...members.map((event) => event.low)),
      close:members.at(-1).close,
      volume:members.reduce((sum, event) => sum + Number(event.volume || 0), 0),
      trades:0,
      sourceId: target === 5 ? SOURCE_ID_5M : `${SOURCE_ID_M1}-derived-${target}m`,
    }));
  }
  return aggregated;
}

async function defaultDownloader(options) {
  const module = await import('dukascopy-node');
  const getHistoricalRates = module.getHistoricalRates || module.default?.getHistoricalRates;
  if (typeof getHistoricalRates !== 'function') throw new Error('dukascopy-node-getHistoricalRates-missing');
  return getHistoricalRates(options);
}

export async function fetchUsdJpyShortHorizon({
  fromMs,
  toMs = Date.now(),
  nowMs = Date.now(),
  downloader = defaultDownloader,
} = {}) {
  if (!Number.isFinite(Number(fromMs))) throw new Error('fx-from-ms-required');
  const endMs = Number(toMs);
  if (!Number.isFinite(endMs) || endMs <= Number(fromMs)) throw new Error('invalid-fx-range');
  const receivedTimestampMs = Date.now();

  const payload = await downloader({
    instrument:'usdjpy',
    dates:{ from:new Date(Number(fromMs)), to:new Date(endMs) },
    timeframe:'m1',
    priceType:'bid',
    format:'json',
    volumes:true,
    ignoreFlats:true,
    batchSize:5,
    pauseBetweenBatchesMs:500,
  });

  const oneMinute = normalizeDukascopyUsdJpyM1(payload, { receivedTimestampMs, nowMs });
  const fiveMinute = aggregateM1Events(oneMinute, 5);
  if (!oneMinute.length) throw new Error('dukascopy-usdjpy-no-closed-m1-data');

  return {
    providerVersion: SHORT_HORIZON_DUKASCOPY_PROVIDER_VERSION,
    packageVersion: DUKASCOPY_NODE_VERSION,
    source: {
      provider:'Dukascopy public datafeed via dukascopy-node',
      instrument:'USDJPY',
      priceType:'bid',
      sourceTimeframe:'m1',
      derivedTimeframes:['5m'],
      closedCandlesOnly:true,
      liveExecutionFeed:false,
      sessionAware:true,
    },
    streams: {
      'USDJPY-1m': oneMinute,
      'USDJPY-5m': fiveMinute,
    },
  };
}
