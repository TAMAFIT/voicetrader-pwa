export const SHORT_HORIZON_MARKET_EVENT_VERSION = 'short-horizon-market-event-v1';

const finite = (value, name) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`invalid-${name}`);
  return number;
};

const nonEmpty = (value, name) => {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`invalid-${name}`);
  return text;
};

const positiveInteger = (value, name) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`invalid-${name}`);
  return number;
};

export function buildClosedOhlcMarketEvent({
  instrument,
  venue,
  assetClass = 'crypto',
  timeframeMinutes,
  sourceTimestampMs,
  receivedTimestampMs,
  open,
  high,
  low,
  close,
  volume = 0,
  trades = 0,
  sourceId,
}) {
  const normalized = {
    schemaVersion: SHORT_HORIZON_MARKET_EVENT_VERSION,
    eventType: 'OHLC_CLOSED',
    assetClass: nonEmpty(assetClass, 'asset-class'),
    instrument: nonEmpty(instrument, 'instrument'),
    venue: nonEmpty(venue, 'venue'),
    timeframeMinutes: positiveInteger(timeframeMinutes, 'timeframe-minutes'),
    sourceTimestampMs: finite(sourceTimestampMs, 'source-timestamp-ms'),
    receivedTimestampMs: finite(receivedTimestampMs, 'received-timestamp-ms'),
    open: finite(open, 'open'),
    high: finite(high, 'high'),
    low: finite(low, 'low'),
    close: finite(close, 'close'),
    volume: finite(volume, 'volume'),
    trades: finite(trades, 'trades'),
    sourceId: nonEmpty(sourceId, 'source-id'),
    dataQuality: {
      status: 'VALID',
      closed: true,
    },
  };

  if (normalized.sourceTimestampMs < 0 || normalized.receivedTimestampMs < 0) throw new Error('invalid-negative-timestamp');
  if (normalized.high < normalized.low) throw new Error('invalid-high-low-range');
  if (normalized.high < Math.max(normalized.open, normalized.close)) throw new Error('invalid-high-bound');
  if (normalized.low > Math.min(normalized.open, normalized.close)) throw new Error('invalid-low-bound');
  if (normalized.volume < 0 || normalized.trades < 0) throw new Error('invalid-negative-volume-or-trades');

  return normalized;
}

export function marketEventKey(event) {
  validateMarketEvent(event);
  return `${event.venue}|${event.instrument}|${event.timeframeMinutes}|${event.sourceTimestampMs}`;
}

export function validateMarketEvent(event) {
  if (!event || typeof event !== 'object') throw new Error('invalid-market-event');
  if (event.schemaVersion !== SHORT_HORIZON_MARKET_EVENT_VERSION) throw new Error('unsupported-market-event-version');
  if (event.eventType !== 'OHLC_CLOSED') throw new Error('unsupported-market-event-type');
  if (event.dataQuality?.closed !== true) throw new Error('market-event-not-closed');
  buildClosedOhlcMarketEvent(event);
  return true;
}

export function equivalentMarketEvent(a, b) {
  validateMarketEvent(a);
  validateMarketEvent(b);
  const fields = [
    'schemaVersion', 'eventType', 'assetClass', 'instrument', 'venue', 'timeframeMinutes',
    'sourceTimestampMs', 'open', 'high', 'low', 'close', 'volume', 'trades', 'sourceId',
  ];
  return fields.every((field) => a[field] === b[field]);
}

export function sortMarketEvents(events = []) {
  return [...events].sort((a, b) => {
    const byTime = Number(a.sourceTimestampMs) - Number(b.sourceTimestampMs);
    if (byTime) return byTime;
    return marketEventKey(a).localeCompare(marketEventKey(b));
  });
}
