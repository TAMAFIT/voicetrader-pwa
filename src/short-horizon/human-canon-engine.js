import { clamp } from '../engine/indicators.js';
import { buildKnowledgeFeatures } from '../knowledge/knowledge-indicators.js';
import { validateMarketEvent } from './market-event.js';
import {
  SHORT_HORIZON_HUMAN_CANON_REGISTRY,
  SHORT_HORIZON_HUMAN_CANON_REGISTRY_VERSION,
} from './human-canon-registry.js';

export const SHORT_HORIZON_HUMAN_CANON_ENGINE_VERSION = 'short-horizon-human-canon-engine-v1';

const round = (value, digits = 3) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

function average(values = []) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function directional(value, positiveThreshold, negativeThreshold, magnitude = 100) {
  const number = Number(value);
  if (number >= positiveThreshold) return magnitude;
  if (number <= negativeThreshold) return -magnitude;
  return 0;
}

function normalizeEvents(events) {
  if (!Array.isArray(events) || events.length < 120) throw new Error('short-horizon-insufficient-history');
  const sorted = [...events].sort((a, b) => Number(a.sourceTimestampMs) - Number(b.sourceTimestampMs));
  const first = sorted[0];
  validateMarketEvent(first);
  if (![1, 5].includes(Number(first.timeframeMinutes))) throw new Error('short-horizon-timeframe-not-supported');

  const seen = new Set();
  for (const event of sorted) {
    validateMarketEvent(event);
    if (
      event.instrument !== first.instrument ||
      event.venue !== first.venue ||
      event.assetClass !== first.assetClass ||
      Number(event.timeframeMinutes) !== Number(first.timeframeMinutes)
    ) throw new Error('short-horizon-mixed-stream');
    const timestamp = Number(event.sourceTimestampMs);
    if (seen.has(timestamp)) throw new Error('short-horizon-duplicate-timestamp');
    seen.add(timestamp);
  }

  return {
    events: sorted,
    series: sorted.map((event) => ({
      t:Number(event.sourceTimestampMs),
      o:Number(event.open), h:Number(event.high), l:Number(event.low), c:Number(event.close),
      volume:Number(event.volume || 0), trades:Number(event.trades || 0),
    })),
    stream: {
      assetClass:first.assetClass,
      instrument:first.instrument,
      venue:first.venue,
      timeframeMinutes:Number(first.timeframeMinutes),
    },
  };
}

function recentContinuity(events, timeframeMinutes, bars) {
  const intervalMs = timeframeMinutes * 60_000;
  const start = Math.max(1, events.length - bars);
  const gaps = [];
  for (let i = start; i < events.length; i += 1) {
    const delta = Number(events[i].sourceTimestampMs) - Number(events[i - 1].sourceTimestampMs);
    if (delta > intervalMs * 1.5) gaps.push({
      previousTimestampMs:Number(events[i - 1].sourceTimestampMs),
      nextTimestampMs:Number(events[i].sourceTimestampMs),
      deltaMinutes:round(delta / 60_000),
    });
  }
  return {
    status:gaps.length ? 'RECENT_GAP' : 'CONTIGUOUS',
    recentGapCount:gaps.length,
    largestRecentGapMinutes:gaps.length ? Math.max(...gaps.map((item) => item.deltaMinutes)) : 0,
    gaps,
  };
}

function trendFamily(features, t) {
  const maAlignment = features.fast > features.slow ? 1 : features.fast < features.slow ? -1 : 0;
  const slope = features.fastSlopePct > 0 && features.slowSlopePct >= 0 ? 1
    : features.fastSlopePct < 0 && features.slowSlopePct <= 0 ? -1 : 0;
  const maVote = maAlignment && maAlignment === slope ? maAlignment * 100 : maAlignment * 50;
  const macdVote = Math.sign(Number(features.macd?.histogram || 0)) * 70;
  const adx = Number(features.dmi?.adx || 0);
  const dmiVote = adx >= t.adxTrend
    ? Math.sign(Number(features.dmi?.plusDI || 0) - Number(features.dmi?.minusDI || 0)) * 100
    : 0;
  return { id:'trend', score:round(average([maVote, macdVote, dmiVote])), components:{ maVote, macdVote, dmiVote, adx:round(adx) } };
}

function momentumFamily(features, t) {
  const rsiVote = directional(features.rsi14, t.rsiMomentumHigh, t.rsiMomentumLow, 80);
  const rocVote = Math.sign(Number(features.roc6Pct || 0)) * 70;
  const stochasticVote = directional(features.stochastic14, t.stochasticMomentumHigh, t.stochasticMomentumLow, 60);
  return { id:'momentum', score:round(average([rsiVote, rocVote, stochasticVote])), components:{ rsiVote, rocVote, stochasticVote } };
}

function meanReversionFamily(features, t) {
  const z = Number(features.bollinger?.z || 0);
  const bollingerVote = z >= t.bollingerExtremeZ ? -100 : z <= -t.bollingerExtremeZ ? 100 : 0;
  const rsiVote = features.rsi14 >= t.rsiExtremeHigh ? -80 : features.rsi14 <= t.rsiExtremeLow ? 80 : 0;
  const stochasticVote = features.stochastic14 >= t.stochasticExtremeHigh ? -70 : features.stochastic14 <= t.stochasticExtremeLow ? 70 : 0;
  return { id:'meanReversion', score:round(average([bollingerVote, rsiVote, stochasticVote])), components:{ bollingerVote, rsiVote, stochasticVote, bollingerZ:round(z) } };
}

function structureFamily(features, t) {
  const price = Number(features.price || 0);
  const donchianVote = price > Number(features.donchian?.high || Infinity) ? 100
    : price < Number(features.donchian?.low || -Infinity) ? -100 : 0;
  const structure = Number(features.marketStructure?.score || 0);
  const structureVote = Math.abs(structure) >= t.structureDirectional ? clamp(structure * 100, -100, 100) : 0;
  return { id:'structure', score:round(average([donchianVote, structureVote])), components:{ donchianVote, structureVote:round(structureVote), structureScore:round(structure) } };
}

function participationFamily(features, t) {
  const obvSlope = Number(features.obvSlopeNormalized || 0);
  const obvVote = Math.abs(obvSlope) >= t.obvDirectional ? Math.sign(obvSlope) * 80 : 0;
  const volumeZ = Number(features.volumeZScore || 0);
  const volumeSpikeVote = volumeZ >= t.volumeSpikeZ ? Math.sign(Number(features.roc6Pct || 0)) * 80 : 0;
  return { id:'participation', score:round(average([obvVote, volumeSpikeVote])), components:{ obvVote, volumeSpikeVote, obvSlope:round(obvSlope), volumeZ:round(volumeZ) } };
}

function aggregateFamilies(families, t) {
  const scores = families.map((family) => Number(family.score || 0));
  const compositeScore = round(average(scores));
  const sign = Math.sign(compositeScore);
  const meaningful = families.filter((family) => Math.abs(Number(family.score || 0)) >= t.familyMeaningfulScore);
  const aligned = meaningful.filter((family) => sign && Math.sign(Number(family.score || 0)) === sign);
  return {
    compositeScore,
    meaningfulFamilyCount:meaningful.length,
    alignedFamilyCount:aligned.length,
    familyAgreement:round(meaningful.length ? aligned.length / meaningful.length : 0),
  };
}

function regimeAndRisk(features, continuity, t) {
  const atrPercentile = Number(features.atrPercentile || 0);
  const realizedVolPercentile = Number(features.realizedVolPercentile || 0);
  const bbWidthPercentile = Number(features.bbWidthPercentile || 0);
  const adx = Number(features.dmi?.adx || 0);
  const volatilityPercentile = Math.max(atrPercentile, realizedVolPercentile);

  let regime = 'RANGE';
  if (volatilityPercentile >= t.volatilePercentile) regime = 'VOLATILE';
  else if (bbWidthPercentile <= t.compressionPercentile) regime = 'COMPRESSION';
  else if (adx >= t.adxTrend) regime = 'TREND';

  let riskGate = 'OPEN';
  const reasons = [];
  if (continuity.recentGapCount > 0) {
    riskGate = 'BLOCK';
    reasons.push('recent-data-gap');
  }
  if (volatilityPercentile >= t.blockVolatilityPercentile) {
    riskGate = 'BLOCK';
    reasons.push('extreme-volatility');
  } else if (riskGate !== 'BLOCK' && volatilityPercentile >= t.cautionVolatilityPercentile) {
    riskGate = 'CAUTION';
    reasons.push('high-volatility');
  }

  return {
    regime,
    riskGate,
    reasons,
    diagnostics:{
      atrPercentile:round(atrPercentile),
      realizedVolPercentile:round(realizedVolPercentile),
      bbWidthPercentile:round(bbWidthPercentile),
      adx:round(adx),
      continuity,
    },
  };
}

function rankedReasons(families, compositeScore) {
  const sign = Math.sign(compositeScore);
  const sorted = [...families].sort((a, b) => Math.abs(Number(b.score)) - Math.abs(Number(a.score)));
  return {
    support: sorted.filter((family) => sign && Math.sign(Number(family.score)) === sign).slice(0, 3).map(({ id, score }) => ({ family:id, score })),
    opposition: sorted.filter((family) => sign && Math.sign(Number(family.score)) === -sign).slice(0, 3).map(({ id, score }) => ({ family:id, score })),
  };
}

export function analyzeShortHorizonHumanCanon(events, { registry = SHORT_HORIZON_HUMAN_CANON_REGISTRY } = {}) {
  if (registry.version !== SHORT_HORIZON_HUMAN_CANON_REGISTRY_VERSION) throw new Error('short-horizon-canon-registry-version-mismatch');
  const { events:sortedEvents, series, stream } = normalizeEvents(events);
  const idx = series.length - 1;
  const features = buildKnowledgeFeatures(series, idx);
  const t = registry.thresholds;
  const families = [
    trendFamily(features, t),
    momentumFamily(features, t),
    meanReversionFamily(features, t),
    structureFamily(features, t),
    participationFamily(features, t),
  ];
  const aggregation = aggregateFamilies(families, t);
  const continuity = recentContinuity(sortedEvents, stream.timeframeMinutes, t.recentContinuityBars);
  const context = regimeAndRisk(features, continuity, t);

  let signal = 'WAIT';
  if (
    context.riskGate !== 'BLOCK' &&
    aggregation.meaningfulFamilyCount >= t.minimumDirectionalFamilies &&
    aggregation.familyAgreement >= t.minimumFamilyAgreement
  ) {
    if (aggregation.compositeScore >= t.signalComposite) signal = 'LONG';
    if (aggregation.compositeScore <= -t.signalComposite) signal = 'SHORT';
  }

  const latest = sortedEvents.at(-1);
  const horizon = registry.horizons[stream.timeframeMinutes];
  const reasons = rankedReasons(families, aggregation.compositeScore);
  const signalStrengthScore = round(clamp(Math.abs(aggregation.compositeScore) * 0.8 + aggregation.familyAgreement * 20, 0, 100), 2);

  return {
    schemaVersion:'short-horizon-human-canon-analysis-v1',
    engineVersion:SHORT_HORIZON_HUMAN_CANON_ENGINE_VERSION,
    registryVersion:registry.version,
    researchOnly:true,
    stream,
    sourceTimestampMs:Number(latest.sourceTimestampMs),
    sourceEventId:`${latest.venue}|${latest.instrument}|${latest.timeframeMinutes}|${latest.sourceTimestampMs}`,
    signal,
    intendedHorizonMinutes:horizon.primaryMinutes,
    secondaryHorizonMinutes:horizon.secondaryMinutes,
    signalStrengthScore,
    confidenceIsCalibratedProbability:false,
    scoreIsExpectedReturn:false,
    aggregation,
    context,
    families,
    reasons,
    features:{
      price:round(features.price, 8),
      fastSma:round(features.fast, 8),
      slowSma:round(features.slow, 8),
      rsi14:round(features.rsi14),
      atr14Pct:round(features.atr14Pct),
      macdHistogram:round(features.macd?.histogram, 8),
      stochastic14:round(features.stochastic14),
      adx:round(features.dmi?.adx),
      plusDI:round(features.dmi?.plusDI),
      minusDI:round(features.dmi?.minusDI),
      bollingerZ:round(features.bollinger?.z),
      roc6Pct:round(features.roc6Pct),
      roc24Pct:round(features.roc24Pct),
      structureScore:round(features.marketStructure?.score),
      obvSlopeNormalized:round(features.obvSlopeNormalized),
      volumeZScore:round(features.volumeZScore),
    },
    governance:{
      optimizedOnObservedShortHorizonData:false,
      parameterSweep:false,
      adaptiveWeights:false,
      selfLearning:false,
      automaticPromotion:false,
      executionAuthorized:false,
      realMoneyRouting:false,
      orderSubmission:false,
    },
  };
}
