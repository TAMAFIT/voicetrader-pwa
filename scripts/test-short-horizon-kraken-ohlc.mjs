import assert from 'node:assert/strict';
import {
  buildKrakenOhlcUrl,
  normalizeKrakenOhlcPayload,
  SHORT_HORIZON_CRYPTO_STREAMS,
} from '../src/short-horizon/kraken-ohlc.js';

const stream = SHORT_HORIZON_CRYPTO_STREAMS[0];
const nowMs = 1_700_000_180_000;
const payload = {
  error: [],
  result: {
    XXBTZUSD: [
      [1_700_000_000, '100', '105', '99', '103', '102', '12.5', 42],
      [1_700_000_120, '103', '106', '102', '105', '104', '10.2', 30],
      [1_700_000_180, '105', '108', '104', '107', '106', '8.1', 21],
    ],
    last: 1_700_000_180,
  },
};
const events = normalizeKrakenOhlcPayload(payload, stream, { nowMs, receivedTimestampMs:nowMs + 500 });
assert.equal(events.length, 2);
assert.equal(events[0].sourceTimestampMs, 1_700_000_000_000);
assert.equal(events[0].receivedTimestampMs, nowMs + 500);
assert.equal(events[1].close, 105);
assert.match(buildKrakenOhlcUrl(stream), /interval=1/);
assert.throws(() => normalizeKrakenOhlcPayload({ error:['EGeneral:test'], result:{} }, stream), /kraken-api-error/);

console.log('short-horizon Kraken OHLC tests passed');
