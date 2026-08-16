import { atrPct, clamp, rsi, sma } from '../engine/indicators.js';

const EPS = 1e-12;
const closeAt = (series, index) => Number(series?.[index]?.c);

function windowValues(series, idx, len, getter) {
  const start = Math.max(0, idx - len + 1);
  const out = [];
  for (let i = start; i <= idx; i++) {
    const value = Number(getter(series[i], i));
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function std(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(Math.max(0, variance));
}

export function ema(series, len, idx) {
  if (!Array.isArray(series) || idx < 0 || !series[idx]) return null;
  const alpha = 2 / (len + 1);
  let value = closeAt(series, 0);
  if (!Number.isFinite(value)) return null;
  for (let i = 1; i <= idx; i++) {
    const close = closeAt(series, i);
    if (Number.isFinite(close)) value = alpha * close + (1 - alpha) * value;
  }
  return value;
}

export function rocPct(series, len, idx) {
  if (idx < len) return 0;
  const current = closeAt(series, idx);
  const previous = closeAt(series, idx - len);
  if (!(current > 0) || !(previous > 0)) return 0;
  return (current / previous - 1) * 100;
}

export function macd(series, idx, fastLen = 12, slowLen = 26, signalLen = 9) {
  if (!Array.isArray(series) || idx < 0 || !series[idx]) return { line:0, signal:0, histogram:0 };
  const fastAlpha = 2 / (fastLen + 1);
  const slowAlpha = 2 / (slowLen + 1);
  const signalAlpha = 2 / (signalLen + 1);
  let fast = closeAt(series, 0) || 0;
  let slow = fast;
  let line = 0;
  let signal = 0;
  for (let i = 1; i <= idx; i++) {
    const close = closeAt(series, i);
    if (!Number.isFinite(close)) continue;
    fast = fastAlpha * close + (1 - fastAlpha) * fast;
    slow = slowAlpha * close + (1 - slowAlpha) * slow;
    line = fast - slow;
    signal = signalAlpha * line + (1 - signalAlpha) * signal;
  }
  return { line, signal, histogram: line - signal };
}

export function bollinger(series, idx, len = 20, mult = 2) {
  const values = windowValues(series, idx, len, bar => bar?.c);
  const mid = mean(values);
  const sigma = std(values);
  const price = closeAt(series, idx) || mid;
  const upper = mid + mult * sigma;
  const lower = mid - mult * sigma;
  const z = sigma > EPS ? (price - mid) / sigma : 0;
  const widthPct = Math.abs(mid) > EPS ? ((upper - lower) / Math.abs(mid)) * 100 : 0;
  return { mid, upper, lower, sigma, z, widthPct };
}

export function stochastic(series, idx, len = 14) {
  const start = Math.max(0, idx - len + 1);
  let high = -Infinity;
  let low = Infinity;
  for (let i = start; i <= idx; i++) {
    high = Math.max(high, Number(series[i]?.h));
    low = Math.min(low, Number(series[i]?.l));
  }
  const close = closeAt(series, idx);
  if (!Number.isFinite(close) || !Number.isFinite(high) || !Number.isFinite(low) || high - low < EPS) return 50;
  return clamp(((close - low) / (high - low)) * 100, 0, 100);
}

export function donchian(series, idx, len = 20) {
  const start = Math.max(0, idx - len);
  const end = Math.max(start, idx - 1);
  let high = -Infinity;
  let low = Infinity;
  for (let i = start; i <= end; i++) {
    high = Math.max(high, Number(series[i]?.h));
    low = Math.min(low, Number(series[i]?.l));
  }
  if (!Number.isFinite(high) || !Number.isFinite(low)) {
    const p = closeAt(series, idx) || 0;
    return { high:p, low:p, mid:p, position:.5 };
  }
  const price = closeAt(series, idx) || (high + low) / 2;
  const range = Math.max(EPS, high - low);
  return { high, low, mid:(high + low) / 2, position:clamp((price - low) / range, 0, 1) };
}

function trueRange(series, idx) {
  if (idx <= 0) return Math.max(0, Number(series[idx]?.h) - Number(series[idx]?.l));
  const high = Number(series[idx]?.h);
  const low = Number(series[idx]?.l);
  const prev = closeAt(series, idx - 1);
  return Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev));
}

export function dmiAdx(series, idx, len = 14) {
  if (idx < len * 2) return { plusDI:0, minusDI:0, adx:0 };
  const trs = [], plus = [], minus = [];
  for (let i = 1; i <= idx; i++) {
    const upMove = Number(series[i]?.h) - Number(series[i - 1]?.h);
    const downMove = Number(series[i - 1]?.l) - Number(series[i]?.l);
    trs.push(trueRange(series, i));
    plus.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minus.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  const dx = [];
  let lastPlusDI = 0, lastMinusDI = 0;
  for (let end = len - 1; end < trs.length; end++) {
    let tr = 0, p = 0, m = 0;
    for (let j = end - len + 1; j <= end; j++) { tr += trs[j]; p += plus[j]; m += minus[j]; }
    tr /= len; p /= len; m /= len;
    lastPlusDI = tr > EPS ? 100 * p / tr : 0;
    lastMinusDI = tr > EPS ? 100 * m / tr : 0;
    const denom = lastPlusDI + lastMinusDI;
    dx.push(denom > EPS ? 100 * Math.abs(lastPlusDI - lastMinusDI) / denom : 0);
  }
  const adx = mean(dx.slice(-len));
  return { plusDI:clamp(lastPlusDI,0,100), minusDI:clamp(lastMinusDI,0,100), adx:clamp(adx,0,100) };
}

export function realizedVolPct(series, idx, len = 20) {
  const returns = [];
  const start = Math.max(1, idx - len + 1);
  for (let i = start; i <= idx; i++) {
    const a = closeAt(series, i - 1), b = closeAt(series, i);
    if (a > 0 && b > 0) returns.push(Math.log(b / a));
  }
  return std(returns) * 100;
}

export function obv(series, idx) {
  let total = 0;
  for (let i = 1; i <= idx; i++) {
    const volume = Number(series[i]?.volume || 0);
    const current = closeAt(series, i), previous = closeAt(series, i - 1);
    if (current > previous) total += volume;
    else if (current < previous) total -= volume;
  }
  return total;
}

export function obvSlopeNormalized(series, idx, len = 10) {
  if (idx < len) return 0;
  const now = obv(series, idx), prior = obv(series, idx - len);
  let totalVolume = 0;
  for (let i = idx - len + 1; i <= idx; i++) totalVolume += Math.abs(Number(series[i]?.volume || 0));
  return totalVolume < EPS ? 0 : clamp((now - prior) / totalVolume, -1, 1);
}

export function volumeZScore(series, idx, len = 30) {
  const values = windowValues(series, idx, len, bar => bar?.volume || 0);
  const sigma = std(values);
  const current = Number(series[idx]?.volume || 0);
  return sigma > EPS ? (current - mean(values)) / sigma : 0;
}

export function marketStructure(series, idx, len = 8) {
  const start = Math.max(1, idx - len + 1);
  let bullish = 0, bearish = 0, comparisons = 0;
  for (let i = start; i <= idx; i++) {
    const current = series[i], prev = series[i - 1];
    if (!current || !prev) continue;
    if (Number(current.h) > Number(prev.h) && Number(current.l) > Number(prev.l)) bullish += 1;
    if (Number(current.h) < Number(prev.h) && Number(current.l) < Number(prev.l)) bearish += 1;
    comparisons += 1;
  }
  return { bullish, bearish, comparisons, score:clamp(comparisons ? (bullish - bearish) / comparisons : 0, -1, 1) };
}

export function percentileRank(values, current) {
  const finite = values.map(Number).filter(Number.isFinite);
  if (!finite.length || !Number.isFinite(Number(current))) return 50;
  return clamp(finite.filter(value => value <= current).length / finite.length * 100, 0, 100);
}

export function rollingMetricPercentile(series, idx, lookback, metric) {
  const start = Math.max(0, idx - lookback + 1);
  const values = [];
  for (let i = start; i <= idx; i++) {
    const value = Number(metric(series, i));
    if (Number.isFinite(value)) values.push(value);
  }
  return percentileRank(values, Number(metric(series, idx)));
}

export function buildKnowledgeFeatures(series, idx) {
  const price = closeAt(series, idx) || 0;
  const fast = sma(series, 12, idx) || price;
  const slow = sma(series, 34, idx) || price;
  const fastPrev = sma(series, 12, Math.max(0, idx - 4)) || fast;
  const slowPrev = sma(series, 34, Math.max(0, idx - 4)) || slow;
  const rsi14 = rsi(series, 14, idx);
  const atr14Pct = atrPct(series, 14, idx);
  const macdValue = macd(series, idx);
  const bb = bollinger(series, idx, 20, 2);
  const stoch = stochastic(series, idx, 14);
  const dmi = dmiAdx(series, idx, 14);
  const channel = donchian(series, idx, 20);
  const roc6 = rocPct(series, 6, idx);
  const roc24 = rocPct(series, 24, idx);
  const rv20Pct = realizedVolPct(series, idx, 20);
  const obvSlope = obvSlopeNormalized(series, idx, 10);
  const volumeZ = volumeZScore(series, idx, 30);
  const structure = marketStructure(series, idx, 8);
  const atrPercentile = rollingMetricPercentile(series, idx, 100, (s, i) => atrPct(s, 14, i));
  const rvPercentile = rollingMetricPercentile(series, idx, 100, (s, i) => realizedVolPct(s, i, 20));
  const bbWidthPercentile = rollingMetricPercentile(series, idx, 100, (s, i) => bollinger(s, i, 20, 2).widthPct);
  return {
    idx, price, fast, slow,
    fastSlopePct:fastPrev ? (fast / fastPrev - 1) * 100 : 0,
    slowSlopePct:slowPrev ? (slow / slowPrev - 1) * 100 : 0,
    rsi14, atr14Pct, atrPercentile,
    macd:macdValue, bollinger:bb, stochastic14:stoch, dmi, donchian:channel,
    roc6Pct:roc6, roc24Pct:roc24,
    realizedVol20Pct:rv20Pct, realizedVolPercentile:rvPercentile,
    obvSlopeNormalized:obvSlope, volumeZScore:volumeZ, marketStructure:structure, bbWidthPercentile,
  };
}
