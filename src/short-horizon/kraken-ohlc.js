import { buildClosedOhlcMarketEvent } from './market-event.js';

export const SHORT_HORIZON_KRAKEN_PROVIDER_VERSION = 'short-horizon-kraken-ohlc-v1';
export const KRAKEN_OHLC_BASE_URL = 'https://api.kraken.com/0/public/OHLC';

export const SHORT_HORIZON_CRYPTO_STREAMS = Object.freeze([
  Object.freeze({ id:'BTCUSD-1m', instrument:'BTCUSD', pair:'XXBTZUSD', timeframeMinutes:1, venue:'kraken' }),
  Object.freeze({ id:'BTCUSD-5m', instrument:'BTCUSD', pair:'XXBTZUSD', timeframeMinutes:5, venue:'kraken' }),
  Object.freeze({ id:'ETHUSD-1m', instrument:'ETHUSD', pair:'XETHZUSD', timeframeMinutes:1, venue:'kraken' }),
  Object.freeze({ id:'ETHUSD-5m', instrument:'ETHUSD', pair:'XETHZUSD', timeframeMinutes:5, venue:'kraken' }),
]);

export function buildKrakenOhlcUrl(stream) {
  if (!stream?.pair || !Number.isInteger(stream?.timeframeMinutes)) throw new Error('invalid-kraken-stream');
  const query = new URLSearchParams({ pair:stream.pair, interval:String(stream.timeframeMinutes) });
  return `${KRAKEN_OHLC_BASE_URL}?${query.toString()}`;
}

export function normalizeKrakenOhlcPayload(payload, stream, { nowMs = Date.now(), receivedTimestampMs = Date.now() } = {}) {
  if (!stream?.instrument || !stream?.pair || !Number.isInteger(stream?.timeframeMinutes)) throw new Error('invalid-kraken-stream');
  if (Array.isArray(payload?.error) && payload.error.length) throw new Error(`kraken-api-error:${payload.error.join('|')}`);
  const result = payload?.result || {};
  const pairKey = Object.keys(result).find((key) => key !== 'last');
  const rows = pairKey ? result[pairKey] : null;
  if (!Array.isArray(rows)) throw new Error('kraken-ohlc-missing-candle-array');

  const intervalMs = stream.timeframeMinutes * 60_000;
  return rows
    .map((row) => {
      const sourceTimestampMs = Number(row?.[0]) * 1000;
      if (!Number.isFinite(sourceTimestampMs)) return null;
      if (sourceTimestampMs + intervalMs > nowMs) return null;
      return buildClosedOhlcMarketEvent({
        instrument: stream.instrument,
        venue: stream.venue || 'kraken',
        assetClass: 'crypto',
        timeframeMinutes: stream.timeframeMinutes,
        sourceTimestampMs,
        receivedTimestampMs,
        open: row?.[1],
        high: row?.[2],
        low: row?.[3],
        close: row?.[4],
        volume: row?.[6] || 0,
        trades: row?.[7] || 0,
        sourceId: `${SHORT_HORIZON_KRAKEN_PROVIDER_VERSION}:${stream.pair}:${stream.timeframeMinutes}`,
      });
    })
    .filter(Boolean)
    .sort((a, b) => a.sourceTimestampMs - b.sourceTimestampMs);
}

export async function fetchKrakenOhlcStream(stream, { fetchImpl = globalThis.fetch, timeoutMs = 10_000, nowMs = Date.now() } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch-unavailable');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(buildKrakenOhlcUrl(stream), {
      method: 'GET',
      headers: { Accept:'application/json', 'User-Agent':'VoiceTrader-ShortHorizon/0.40' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response?.ok) throw new Error(`kraken-http-${response?.status ?? 'unknown'}`);
    const payload = await response.json();
    const receivedTimestampMs = Date.now();
    const events = normalizeKrakenOhlcPayload(payload, stream, { nowMs, receivedTimestampMs });
    if (!events.length) throw new Error(`kraken-no-closed-events:${stream.id}`);
    return {
      stream,
      events,
      meta: {
        providerVersion: SHORT_HORIZON_KRAKEN_PROVIDER_VERSION,
        fetchedAtMs: receivedTimestampMs,
        sourceWindowLimit: 720,
        closedOnly: true,
        url: buildKrakenOhlcUrl(stream),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
