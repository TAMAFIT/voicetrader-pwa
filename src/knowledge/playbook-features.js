import { clamp } from '../engine/indicators.js';
import { buildKnowledgeFeatures } from './knowledge-indicators.js';

const EPS = 1e-12;

export function efficiencyRatio(series, idx, len = 20) {
  if (!Array.isArray(series) || idx <= 0 || !series[idx]) return 0;
  const start = Math.max(0, idx - len);
  const first = Number(series[start]?.c);
  const last = Number(series[idx]?.c);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return 0;
  let path = 0;
  for (let i = start + 1; i <= idx; i++) {
    const a = Number(series[i - 1]?.c);
    const b = Number(series[i]?.c);
    if (Number.isFinite(a) && Number.isFinite(b)) path += Math.abs(b - a);
  }
  if (path < EPS) return 0;
  return clamp(Math.abs(last - first) / path, 0, 1);
}

export function candleAnatomy(bar = {}) {
  const o = Number(bar.o);
  const h = Number(bar.h);
  const l = Number(bar.l);
  const c = Number(bar.c);
  if (![o,h,l,c].every(Number.isFinite)) {
    return { range:0, body:0, bodyPct:0, upperWickPct:0, lowerWickPct:0, closeLocation:.5, direction:0 };
  }
  const range = Math.max(EPS, h - l);
  const body = Math.abs(c - o);
  const upperWick = Math.max(0, h - Math.max(o, c));
  const lowerWick = Math.max(0, Math.min(o, c) - l);
  return {
    range,
    body,
    bodyPct:clamp(body / range, 0, 1),
    upperWickPct:clamp(upperWick / range, 0, 1),
    lowerWickPct:clamp(lowerWick / range, 0, 1),
    closeLocation:clamp((c - l) / range, 0, 1),
    direction:Math.sign(c - o),
  };
}

function safeRatio(a, b, fallback = 1) {
  const x = Number(a), y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(y) < EPS) return fallback;
  return x / y;
}

function atrPrice(base) {
  return Math.max(EPS, Number(base.price || 0) * Math.max(.0001, Number(base.atr14Pct || 0)) / 100);
}

export function buildPlaybookFeatures(series, idx) {
  const base = buildKnowledgeFeatures(series, idx);
  const prev1 = buildKnowledgeFeatures(series, Math.max(0, idx - 1));
  const prev3 = buildKnowledgeFeatures(series, Math.max(0, idx - 3));
  const anatomy = candleAnatomy(series[idx]);
  const previousAnatomy = candleAnatomy(series[Math.max(0, idx - 1)]);
  const atrPx = atrPrice(base);
  const price = Number(base.price || 0);
  const fast = Number(base.fast || price);
  const donchianBreakSign = price > Number(base.donchian?.high ?? Infinity)
    ? 1
    : price < Number(base.donchian?.low ?? -Infinity)
      ? -1
      : 0;
  const previousBreakSign = Number(prev1.price || 0) > Number(prev1.donchian?.high ?? Infinity)
    ? 1
    : Number(prev1.price || 0) < Number(prev1.donchian?.low ?? -Infinity)
      ? -1
      : 0;
  const currentInsideChannel = price <= Number(base.donchian?.high ?? Infinity) && price >= Number(base.donchian?.low ?? -Infinity);
  const maDirection = Number(base.fast) > Number(base.slow) ? 1 : Number(base.fast) < Number(base.slow) ? -1 : 0;
  const macdSign = Math.sign(Number(base.macd?.histogram || 0));
  const roc6Sign = Math.sign(Number(base.roc6Pct || 0));
  const roc24Sign = Math.sign(Number(base.roc24Pct || 0));
  const structureSign = Math.sign(Number(base.marketStructure?.score || 0));
  const obvSign = Math.sign(Number(base.obvSlopeNormalized || 0));
  return {
    ...base,
    efficiencyRatio20:efficiencyRatio(series, idx, 20),
    efficiencyRatio40:efficiencyRatio(series, idx, 40),
    anatomy,
    previousAnatomy,
    atrPrice:atrPx,
    priceToFastAtr:(price - fast) / atrPx,
    maDirection,
    macdSign,
    roc6Sign,
    roc24Sign,
    structureSign,
    obvSign,
    donchianBreakSign,
    previousBreakSign,
    currentInsideChannel,
    bbWidthExpansionRatio:safeRatio(base.bollinger?.widthPct, prev3.bollinger?.widthPct, 1),
    bbWidthChangePct:Number(prev3.bollinger?.widthPct) > EPS
      ? (Number(base.bollinger?.widthPct) / Number(prev3.bollinger?.widthPct) - 1) * 100
      : 0,
    priorBbWidthPercentile:Number(prev3.bbWidthPercentile || 50),
    atrPercentileChange:Number(base.atrPercentile || 50) - Number(prev3.atrPercentile || 50),
    realizedVolPercentileChange:Number(base.realizedVolPercentile || 50) - Number(prev3.realizedVolPercentile || 50),
    prev1:{
      price:prev1.price,
      donchian:prev1.donchian,
      bollinger:prev1.bollinger,
      rsi14:prev1.rsi14,
      roc6Pct:prev1.roc6Pct,
      volumeZScore:prev1.volumeZScore,
      anatomy:previousAnatomy,
    },
  };
}
