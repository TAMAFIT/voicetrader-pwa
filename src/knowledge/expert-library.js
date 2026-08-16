import { clamp } from '../engine/indicators.js';
import { HUMAN_KNOWLEDGE_REGISTRY_VERSION } from './knowledge-registry.js';

export const HUMAN_EXPERT_LIBRARY_VERSION = 'human-expert-library-0.1';
export const DIRECTIONAL_FAMILIES = Object.freeze(['trend','momentum','meanReversion','structure','volume']);

const round = (value, digits = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

function expert(id, label, family, score, inputs, note = '') {
  const bounded = round(clamp(Number(score) || 0, -100, 100));
  return {
    id,
    label,
    family,
    role: 'alpha',
    score: bounded,
    direction: bounded > 7 ? 'UP' : bounded < -7 ? 'DOWN' : 'NEUTRAL',
    active: true,
    inputs,
    note,
    researchOnly: true,
    calibratedProbability: false,
    expectedReturnBps: false,
  };
}

export function runHumanAlphaExperts(features) {
  const f = features;
  const atrPrice = Math.max(1e-9, Number(f.price) * Math.max(.0001, Number(f.atr14Pct || 0)) / 100);
  const maAlignment = f.slow ? ((f.fast / f.slow) - 1) * 4200 : 0;
  const maSlope = (Number(f.fastSlopePct || 0) * 24) + (Number(f.slowSlopePct || 0) * 18);
  const macdHistogramNorm = Number(f.macd?.histogram || 0) / atrPrice * 70;
  const dmiDirection = (Number(f.dmi?.plusDI || 0) - Number(f.dmi?.minusDI || 0)) * (Number(f.dmi?.adx || 0) / 25);
  const rocMomentum = Number(f.roc24Pct || 0) * 12;
  const rsiMomentum = (Number(f.rsi14 || 50) - 50) * 3.2;
  const stochasticMomentum = (Number(f.stochastic14 || 50) - 50) * 1.8;

  let bollingerReversion = 0;
  const z = Number(f.bollinger?.z || 0);
  if (Math.abs(z) >= .75) bollingerReversion = -z * 38;

  let rsiReversion = 0;
  if (f.rsi14 >= 65) rsiReversion = -(f.rsi14 - 65) * 5.5;
  if (f.rsi14 <= 35) rsiReversion = (35 - f.rsi14) * 5.5;

  let stochasticReversion = 0;
  if (f.stochastic14 >= 80) stochasticReversion = -(f.stochastic14 - 80) * 4;
  if (f.stochastic14 <= 20) stochasticReversion = (20 - f.stochastic14) * 4;

  const price = Number(f.price || 0);
  let donchianBreakout = 0;
  if (price > Number(f.donchian?.high || Infinity)) donchianBreakout = 90;
  else if (price < Number(f.donchian?.low || -Infinity)) donchianBreakout = -90;

  const structureScore = Number(f.marketStructure?.score || 0) * 100;
  const rangeLocation = (Number(f.donchian?.position ?? .5) - .5) * 110;
  const obvConfirm = Number(f.obvSlopeNormalized || 0) * 100;
  const volumeZ = Number(f.volumeZScore || 0);
  const shortMomentumSign = Math.sign(Number(f.roc6Pct || 0));
  const volumeSpike = volumeZ > .75 ? shortMomentumSign * Math.min(100, volumeZ * 36) : 0;

  return [
    expert('TREND_MA_ALIGNMENT_001','MA Alignment','trend',maAlignment,{ fast:f.fast, slow:f.slow }),
    expert('TREND_MA_SLOPE_001','MA Slope','trend',maSlope,{ fastSlopePct:f.fastSlopePct, slowSlopePct:f.slowSlopePct }),
    expert('TREND_MACD_001','MACD Histogram','trend',macdHistogramNorm,{ histogram:f.macd?.histogram, atr14Pct:f.atr14Pct }),
    expert('TREND_DMI_ADX_001','DMI + ADX','trend',dmiDirection,{ plusDI:f.dmi?.plusDI, minusDI:f.dmi?.minusDI, adx:f.dmi?.adx }),
    expert('MOM_ROC_001','Rate of Change','momentum',rocMomentum,{ roc24Pct:f.roc24Pct }),
    expert('MOM_RSI_002','RSI Momentum','momentum',rsiMomentum,{ rsi:f.rsi14 }),
    expert('MOM_STOCH_001','Stochastic Momentum','momentum',stochasticMomentum,{ stochastic:f.stochastic14 }),
    expert('MR_BOLLINGER_Z_001','Bollinger Z Reversion','meanReversion',bollingerReversion,{ z:f.bollinger?.z, widthPct:f.bollinger?.widthPct }),
    expert('MR_RSI_EXTREME_001','RSI Extreme Reversion','meanReversion',rsiReversion,{ rsi:f.rsi14 }),
    expert('MR_STOCH_EXTREME_001','Stochastic Extreme Reversion','meanReversion',stochasticReversion,{ stochastic:f.stochastic14 }),
    expert('STRUCT_DONCHIAN_001','Donchian Breakout','structure',donchianBreakout,{ high:f.donchian?.high, low:f.donchian?.low, price }),
    expert('STRUCT_HHHL_001','HH / HL Structure','structure',structureScore,{ ...f.marketStructure }),
    expert('STRUCT_RANGE_LOCATION_001','Range Location','structure',rangeLocation,{ position:f.donchian?.position }),
    expert('VOL_OBV_CONFIRM_001','OBV Confirmation','volume',obvConfirm,{ obvSlopeNormalized:f.obvSlopeNormalized }),
    expert('VOL_SPIKE_CONFIRM_001','Volume Spike Confirmation','volume',volumeSpike,{ volumeZScore:volumeZ, roc6Pct:f.roc6Pct }),
  ];
}

export function aggregateFamilies(experts = []) {
  const families = {};
  for (const family of DIRECTIONAL_FAMILIES) {
    const members = experts.filter(item => item.family === family && item.active !== false);
    const score = members.length
      ? members.reduce((sum, item) => sum + Number(item.score || 0), 0) / members.length
      : 0;
    families[family] = {
      family,
      score: round(clamp(score, -100, 100)),
      memberCount: members.length,
      memberIds: members.map(item => item.id),
    };
  }
  const activeFamilies = Object.values(families).filter(item => item.memberCount > 0);
  const compositeScore = activeFamilies.length
    ? activeFamilies.reduce((sum, item) => sum + item.score, 0) / activeFamilies.length
    : 0;
  const sign = Math.sign(compositeScore);
  const meaningful = activeFamilies.filter(item => Math.abs(item.score) >= 8);
  const aligned = meaningful.filter(item => Math.sign(item.score) === sign).length;
  const familyAgreement = meaningful.length ? aligned / meaningful.length : 0;
  return {
    version: 'family-normalization-0.1',
    equalFamilyWeight: true,
    correlatedRuleCountDoesNotIncreaseFamilyWeight: true,
    families,
    activeFamilyCount: activeFamilies.length,
    compositeScore: round(clamp(compositeScore, -100, 100)),
    familyAgreement: round(familyAgreement, 3),
  };
}

export function buildRegimeAndRiskContext(features) {
  const adx = Number(features.dmi?.adx || 0);
  const bbWidthPercentile = Number(features.bbWidthPercentile || 50);
  const atrPercentile = Number(features.atrPercentile || 50);
  const rvPercentile = Number(features.realizedVolPercentile || 50);
  const volumeZ = Number(features.volumeZScore || 0);

  let regime = 'range';
  if (atrPercentile >= 82 || rvPercentile >= 82) regime = 'volatile';
  else if (bbWidthPercentile <= 20) regime = 'compression';
  else if (adx >= 25) regime = 'trend';

  const volatilityRisk = clamp((atrPercentile + rvPercentile) / 2, 0, 100);
  const lowParticipationPenalty = volumeZ < -1 ? Math.min(30, Math.abs(volumeZ + 1) * 12 + 8) : 0;
  const riskScore = clamp(volatilityRisk * .82 + lowParticipationPenalty, 0, 100);
  const riskGate = riskScore >= 88 ? 'BLOCK' : riskScore >= 72 ? 'CAUTION' : 'OPEN';

  return {
    version: 'regime-risk-context-0.1',
    regime,
    riskScore: round(riskScore),
    riskGate,
    diagnostics: {
      adx: round(adx),
      atrPercentile: round(atrPercentile),
      realizedVolPercentile: round(rvPercentile),
      bbWidthPercentile: round(bbWidthPercentile),
      volumeZScore: round(volumeZ),
      volatilityRisk: round(volatilityRisk),
      lowParticipationPenalty: round(lowParticipationPenalty),
    },
    directionalVote: false,
    registryVersion: HUMAN_KNOWLEDGE_REGISTRY_VERSION,
  };
}
