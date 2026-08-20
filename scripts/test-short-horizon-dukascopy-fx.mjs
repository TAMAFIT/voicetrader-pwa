import assert from 'node:assert/strict';
import {
  aggregateM1Events,
  fetchUsdJpyShortHorizon,
  normalizeDukascopyUsdJpyM1,
} from '../src/short-horizon/dukascopy-fx.js';

const BASE = Date.UTC(2026, 7, 20, 0, 0, 0);
const rows = Array.from({ length:6 }, (_, index) => ({
  timestamp: BASE + index * 60_000,
  open: 150 + index * 0.01,
  high: 150.02 + index * 0.01,
  low: 149.99 + index * 0.01,
  close: 150.005 + index * 0.01,
  volume: 10 + index,
}));

const normalized = normalizeDukascopyUsdJpyM1(rows, {
  receivedTimestampMs: BASE + 10 * 60_000,
  nowMs: BASE + 6 * 60_000,
});
assert.equal(normalized.length, 6);
assert.equal(normalized[0].assetClass, 'fx');
assert.equal(normalized[0].instrument, 'USDJPY');
assert.equal(normalized[0].venue, 'dukascopy');
assert.equal(normalized[0].timeframeMinutes, 1);

const five = aggregateM1Events(normalized, 5);
assert.equal(five.length, 1);
assert.equal(five[0].sourceTimestampMs, BASE);
assert.equal(five[0].open, rows[0].open);
assert.equal(five[0].close, rows[4].close);
assert.equal(five[0].high, Math.max(...rows.slice(0, 5).map((row) => row.high)));
assert.equal(five[0].low, Math.min(...rows.slice(0, 5).map((row) => row.low)));
assert.equal(five[0].volume, rows.slice(0, 5).reduce((sum, row) => sum + row.volume, 0));

let captured = null;
const fetched = await fetchUsdJpyShortHorizon({
  fromMs:BASE,
  toMs:BASE + 6 * 60_000,
  nowMs:BASE + 6 * 60_000,
  downloader:async (options) => {
    captured = options;
    return rows;
  },
});
assert.equal(captured.instrument, 'usdjpy');
assert.equal(captured.timeframe, 'm1');
assert.equal(captured.priceType, 'bid');
assert.equal(fetched.streams['USDJPY-1m'].length, 6);
assert.equal(fetched.streams['USDJPY-5m'].length, 1);
assert.equal(fetched.source.liveExecutionFeed, false);

const incomplete = normalizeDukascopyUsdJpyM1(rows, {
  receivedTimestampMs: BASE,
  nowMs: BASE + 5 * 60_000 + 30_000,
});
assert.equal(incomplete.length, 5);

console.log('short-horizon Dukascopy FX tests passed');
