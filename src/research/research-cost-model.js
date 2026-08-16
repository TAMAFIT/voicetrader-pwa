import { instruments } from '../config.js';
import { atrPct } from '../engine/indicators.js';

export const RESEARCH_COST_MODEL_VERSION = 'research-cost-v0.1';

const round = (value, digits = 4) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

/**
 * Deterministic expected round-trip friction using information available at `idx` only.
 * Mirrors ExecutionEngine estimated-v0.3 expectation:
 * spread + 2*fee + 2*expected slippage, where expected slippage uses ATR%.
 * This is an estimate, not an exchange fill guarantee.
 */
export function estimateResearchRoundTripCostBps(series, idx, key = 'BTCUSD') {
  const market = instruments[key];
  if (!market || !Array.isArray(series) || !series[idx]) return null;
  const atr = Math.max(.15, Number(atrPct(series,14,idx)) || .15);
  const expectedRandomCoefficient = (0.45 + 1.60) / 2;
  const slippageBps = expectedRandomCoefficient * atr * (market.market === 'crypto' ? 1 : .35);
  return round(Number(market.spreadBps || 0) + Number(market.feeBps || 0) * 2 + slippageBps * 2);
}

export function buildResearchCostSnapshot(series, idx, key = 'BTCUSD') {
  const costBps = estimateResearchRoundTripCostBps(series,idx,key);
  return {
    version:RESEARCH_COST_MODEL_VERSION,
    instrument:key,
    barIndex:idx,
    candleTime:Number(series?.[idx]?.t) || null,
    estimatedRoundTripCostBps:costBps,
    deterministic:true,
    entryBarInformationOnly:true,
    includesSpread:true,
    includesFees:true,
    includesExpectedSlippage:true,
    realizedFillGuarantee:false,
  };
}
