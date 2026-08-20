import assert from 'node:assert/strict';
import {
  buildClosedOhlcMarketEvent,
  equivalentMarketEvent,
  marketEventKey,
  validateMarketEvent,
} from '../src/short-horizon/market-event.js';

const base = buildClosedOhlcMarketEvent({
  instrument:'BTCUSD', venue:'kraken', timeframeMinutes:1,
  sourceTimestampMs:1_700_000_000_000, receivedTimestampMs:1_700_000_061_000,
  open:100, high:105, low:99, close:103, volume:12.5, trades:42,
  sourceId:'test-source',
});

assert.equal(validateMarketEvent(base), true);
assert.equal(marketEventKey(base), 'kraken|BTCUSD|1|1700000000000');
assert.equal(equivalentMarketEvent(base, { ...base, receivedTimestampMs:base.receivedTimestampMs + 1000 }), true);
assert.equal(equivalentMarketEvent(base, { ...base, close:104 }), false);
assert.throws(() => buildClosedOhlcMarketEvent({ ...base, high:98 }), /invalid-high/);
assert.throws(() => validateMarketEvent({ ...base, dataQuality:{ closed:false } }), /not-closed/);

console.log('short-horizon market event tests passed');
