import assert from 'node:assert/strict';
import { instruments } from '../src/config.js';
import { sma, rsi, atrPct, clamp } from '../src/engine/indicators.js';
import { ShadowEngine } from '../src/engine/shadow-engine.js';

function makeSeries(base, n = 240) {
  const out = [];
  let p = base;
  for (let i = 0; i < n; i++) {
    const ret = Math.sin(i / 9) * 0.0025 + Math.cos(i / 17) * 0.0011 + ((i % 31) - 15) * 0.00003;
    const o = p;
    const c = Math.max(0.00001, p * (1 + ret));
    const range = 0.0012 + Math.abs(Math.sin(i / 13)) * 0.0017;
    const h = Math.max(o, c) * (1 + range);
    const l = Math.min(o, c) * (1 - range);
    out.push({ o, h, l, c, t: 1700000000 + i * 14400, volume: 100 + i });
    p = c;
  }
  return out;
}

function legacyAnalyze(key, arr, idx) {
  const market = instruments[key];
  const p = arr[idx].c;
  const fast = sma(arr, 12, idx) || p;
  const slow = sma(arr, 34, idx) || p;
  const rsiValue = rsi(arr, 14, idx);
  const atr = atrPct(arr, 14, idx);
  const trend = clamp(((fast / slow) - 1) * 1600, -22, 22);
  const momentum = clamp((rsiValue - 50) * .52, -18, 18);
  const recent = arr.slice(Math.max(0, idx - 18), idx).map(x => x.c);
  const hi = Math.max(...recent);
  const lo = Math.min(...recent);
  let breakout = 0;
  if (p > hi) breakout = 10;
  if (p < lo) breakout = -10;
  const rawAlphaScore = trend + momentum + breakout;
  const up = clamp(50 + rawAlphaScore, 12, 88);
  const dir = up >= 50 ? 'UP' : 'DOWN';
  const conf = Math.round(Math.max(up, 100 - up));
  const trendStrength = clamp(Math.abs((fast / slow) - 1) * 4200, 0, 100);
  const timing = Math.round(clamp(
    42 + trendStrength * .45 + Math.abs(rsiValue - 50) * .35 + (breakout ? 12 : 0) - Math.max(0, atr - 2.2) * 8,
    8,
    96,
  ));
  const risk = Math.round(clamp(
    18 + atr * 13 + (market.spreadBps + market.feeBps) * .8 + Math.abs(rsiValue - 50) * .15,
    8,
    92,
  ));
  const decisionScore = timing - risk * .38 + (conf - 50) * .7;
  let action = 'WAIT';
  if (decisionScore > 42 && conf >= 61) action = dir === 'UP' ? 'BUY' : 'SELL';
  return { rawAlphaScore, decisionScore, action, trend, momentum, breakout };
}

for (const key of Object.keys(instruments)) {
  const arr = makeSeries(instruments[key].base);
  const engine = new ShadowEngine({ seriesProvider: () => arr });
  for (const idx of [40, 60, 90, 120, 160, 200, 230]) {
    const legacy = legacyAnalyze(key, arr, idx);
    const current = engine.analyze(key, idx);
    assert.equal(current.rawAlphaScore, legacy.rawAlphaScore, `${key}@${idx}: raw alpha changed`);
    assert.equal(current.decisionScore, legacy.decisionScore, `${key}@${idx}: decision score changed`);
    assert.equal(current.action, legacy.action, `${key}@${idx}: Champion action changed`);
    assert.equal(current.factors.trend, legacy.trend, `${key}@${idx}: trend factor changed`);
    assert.equal(current.factors.momentum, legacy.momentum, `${key}@${idx}: momentum factor changed`);
    assert.equal(current.factors.breakout, legacy.breakout, `${key}@${idx}: breakout factor changed`);
    const contribution = current.experts.results.reduce((sum, expert) => sum + expert.contribution, 0);
    assert.equal(contribution, current.rawAlphaScore, `${key}@${idx}: Expert contributions do not reconstruct raw alpha`);
    const expectedDecision = current.action === 'BUY' ? 'ENTER_LONG' : current.action === 'SELL' ? 'ENTER_SHORT' : 'NO_ENTRY';
    assert.equal(current.entryDecision, expectedDecision, `${key}@${idx}: formal entry state disagrees with legacy action`);
  }
}

console.log('Champion behavior preserved across fixed Expert extraction and formal entry policy.');
