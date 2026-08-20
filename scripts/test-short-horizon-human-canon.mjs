import assert from 'node:assert/strict';
import { buildClosedOhlcMarketEvent } from '../src/short-horizon/market-event.js';
import { analyzeShortHorizonHumanCanon } from '../src/short-horizon/human-canon-engine.js';
import { getShortHorizonHumanCanonRegistrySnapshot } from '../src/short-horizon/human-canon-registry.js';

const BASE = Date.UTC(2026, 7, 20, 0, 0, 0);

function makeSeries({ direction = 1, flat = false, gapAt = null, instrument='BTCUSD', venue='kraken', assetClass='crypto' } = {}) {
  let extraGap = 0;
  return Array.from({ length:160 }, (_, index) => {
    if (gapAt === index) extraGap += 5 * 60_000;
    const close = flat ? 100 : 100 + direction * index * 0.1;
    const open = flat ? close : close - direction * 0.03;
    const wick = flat ? 0.05 : index < 100 ? 0.4 : 0.05;
    return buildClosedOhlcMarketEvent({
      assetClass,
      instrument,
      venue,
      timeframeMinutes:1,
      sourceTimestampMs:BASE + index * 60_000 + extraGap,
      receivedTimestampMs:BASE + index * 60_000 + extraGap + 61_000,
      open,
      high:Math.max(open, close) + wick,
      low:Math.min(open, close) - wick,
      close,
      volume:100 + index * 2,
      trades:20 + index,
      sourceId:'synthetic-canon-test',
    });
  });
}

const registry = getShortHorizonHumanCanonRegistrySnapshot();
assert.equal(registry.philosophy.optimizedOnObservedShortHorizonData, false);
assert.equal(registry.philosophy.parameterSweep, false);
assert.equal(registry.philosophy.adaptiveWeights, false);
assert.equal(registry.thresholds.rsiExtremeHigh, 70);
assert.equal(registry.thresholds.rsiExtremeLow, 30);

const up = analyzeShortHorizonHumanCanon(makeSeries({ direction:1 }));
assert.equal(up.signal, 'LONG');
assert.equal(up.confidenceIsCalibratedProbability, false);
assert.equal(up.scoreIsExpectedReturn, false);
assert.equal(up.governance.executionAuthorized, false);
assert.ok(up.aggregation.compositeScore >= 25);
assert.ok(up.aggregation.familyAgreement >= 0.6);
assert.equal(up.intendedHorizonMinutes, 5);

const down = analyzeShortHorizonHumanCanon(makeSeries({ direction:-1 }));
assert.equal(down.context.riskGate, 'OPEN');
assert.equal(down.signal, 'SHORT');
assert.ok(down.aggregation.compositeScore <= -25);

const flat = analyzeShortHorizonHumanCanon(makeSeries({ flat:true }));
assert.equal(flat.signal, 'WAIT');

const gap = analyzeShortHorizonHumanCanon(makeSeries({ direction:1, gapAt:150 }));
assert.equal(gap.context.riskGate, 'BLOCK');
assert.equal(gap.signal, 'WAIT');
assert.ok(gap.context.diagnostics.continuity.recentGapCount >= 1);

const fx = analyzeShortHorizonHumanCanon(makeSeries({
  direction:1, instrument:'USDJPY', venue:'dukascopy', assetClass:'fx',
}));
assert.equal(fx.stream.assetClass, 'fx');
assert.equal(fx.signal, 'LONG');

assert.throws(() => analyzeShortHorizonHumanCanon(makeSeries({ direction:1 }).slice(0, 50)), /insufficient-history/);

console.log('short-horizon Human Canon tests passed');
