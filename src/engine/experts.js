import { clamp } from './indicators.js';

// v0.4: observability only. These weights are frozen Champion configuration,
// not learned weights and not evidence that any Expert has persistent edge.
export const EXPERT_SET_VERSION = 'experts-0.1-fixed';
export const EXPERT_WEIGHTS = Object.freeze({
  trend: 1,
  momentum: 1,
  breakout: 1,
});

export function trendExpert({ fast, slow }) {
  const score = clamp(((fast / slow) - 1) * 1600, -22, 22);
  return {
    id: 'trend',
    label: 'Trend Expert',
    version: 'trend-ma-001',
    score,
    weight: EXPERT_WEIGHTS.trend,
    contribution: score * EXPERT_WEIGHTS.trend,
    inputs: { fastMA: fast, slowMA: slow },
  };
}

export function momentumExpert({ rsiValue }) {
  const score = clamp((rsiValue - 50) * .52, -18, 18);
  return {
    id: 'momentum',
    label: 'Momentum Expert',
    version: 'momentum-rsi-001',
    score,
    weight: EXPERT_WEIGHTS.momentum,
    contribution: score * EXPERT_WEIGHTS.momentum,
    inputs: { rsi: rsiValue },
  };
}

export function breakoutExpert({ price, recentHigh, recentLow }) {
  let score = 0;
  if (price > recentHigh) score = 10;
  if (price < recentLow) score = -10;
  return {
    id: 'breakout',
    label: 'Breakout Expert',
    version: 'breakout-18bar-001',
    score,
    weight: EXPERT_WEIGHTS.breakout,
    contribution: score * EXPERT_WEIGHTS.breakout,
    inputs: { price, recentHigh, recentLow },
  };
}

export function runAlphaExperts({ fast, slow, rsiValue, price, recentHigh, recentLow }) {
  const results = [
    trendExpert({ fast, slow }),
    momentumExpert({ rsiValue }),
    breakoutExpert({ price, recentHigh, recentLow }),
  ];
  const rawAlphaScore = results.reduce((sum, expert) => sum + expert.contribution, 0);
  return {
    version: EXPERT_SET_VERSION,
    weights: { ...EXPERT_WEIGHTS },
    results,
    rawAlphaScore,
  };
}
