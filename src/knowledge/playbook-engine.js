import { clamp } from '../engine/indicators.js';
import { HumanKnowledgeEngine } from './human-knowledge-engine.js';
import { buildPlaybookFeatures } from './playbook-features.js';
import { getHumanPlaybookRegistrySnapshot, HUMAN_PLAYBOOK_REGISTRY_VERSION } from './playbook-registry.js';

export const HUMAN_PLAYBOOK_ENGINE_VERSION = 'human-playbook-wave2-0.1';
export const PLAYBOOK_ARCHETYPES = Object.freeze(['continuation','breakout','reversion','reversal']);

const round = (value, digits = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

function strength(value) {
  return clamp(Number(value) || 0, 0, 100);
}

function signOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.sign(number) : 0;
}

function alpha(id, label, archetype, score, active, reason, inputs = {}) {
  const bounded = active ? round(clamp(Number(score) || 0, -100, 100)) : 0;
  return {
    id,
    label,
    archetype,
    role:'alpha',
    active:Boolean(active),
    score:bounded,
    direction:bounded > 7 ? 'UP' : bounded < -7 ? 'DOWN' : 'NEUTRAL',
    reason,
    inputs,
    researchOnly:true,
    expectedReturnBps:false,
    calibratedProbability:false,
  };
}

function gate(id, label, active, blockedDirectionSign, reason, inputs = {}) {
  return {
    id,
    label,
    role:'gate',
    active:Boolean(active),
    blockedDirectionSign:active ? Math.sign(Number(blockedDirectionSign) || 0) : 0,
    reason,
    inputs,
    researchOnly:true,
    directionalVote:false,
  };
}

function sameNonZeroSign(...values) {
  const signs = values.map(signOrZero);
  return signs.length > 0 && signs[0] !== 0 && signs.every(value => value === signs[0]);
}

export function runHumanPlaybooks(features, context) {
  const f = features;
  const regime = context?.regime || 'range';
  const riskGate = context?.riskGate || 'OPEN';
  const riskOpen = riskGate !== 'BLOCK';
  const maSign = f.maDirection;
  const breakoutSign = f.donchianBreakSign;
  const closeLoc = Number(f.anatomy?.closeLocation ?? .5);
  const rsi = Number(f.rsi14 || 50);
  const adx = Number(f.dmi?.adx || 0);
  const efficiency = Number(f.efficiencyRatio20 || 0);
  const volumeZ = Number(f.volumeZScore || 0);
  const obv = Number(f.obvSlopeNormalized || 0);
  const structure = Number(f.marketStructure?.score || 0);
  const roc6 = Number(f.roc6Pct || 0);
  const roc24 = Number(f.roc24Pct || 0);
  const macdHist = Number(f.macd?.histogram || 0);
  const bbZ = Number(f.bollinger?.z || 0);
  const channelPos = Number(f.donchian?.position ?? .5);
  const atrPctile = Number(f.atrPercentile || 50);
  const rvPctile = Number(f.realizedVolPercentile || 50);

  const pullbackDistance = Number(f.priceToFastAtr || 0);
  const pullbackLong = regime === 'trend' && maSign > 0 && Number(f.fastSlopePct) > 0 && pullbackDistance >= -.75 && pullbackDistance <= .45 && rsi >= 42 && rsi <= 68 && roc6 > -.8 && closeLoc >= .52 && efficiency >= .18;
  const pullbackShort = regime === 'trend' && maSign < 0 && Number(f.fastSlopePct) < 0 && pullbackDistance <= .75 && pullbackDistance >= -.45 && rsi <= 58 && rsi >= 32 && roc6 < .8 && closeLoc <= .48 && efficiency >= .18;
  const pullbackSign = pullbackLong ? 1 : pullbackShort ? -1 : 0;
  const pullbackScore = pullbackSign * strength(42 + efficiency * 35 + Math.min(18, Math.abs(roc6) * 8) + Math.abs(closeLoc - .5) * 28);

  const trendBreakActive = regime === 'trend' && breakoutSign !== 0 && breakoutSign === maSign && adx >= 22 && signOrZero(structure) !== -breakoutSign && riskOpen;
  const trendBreakScore = breakoutSign * strength(52 + Math.max(0, adx - 22) * 1.15 + efficiency * 24 + Math.abs(structure) * 12);

  const volumeBreakActive = breakoutSign !== 0 && volumeZ >= .5 && signOrZero(obv) === breakoutSign && signOrZero(roc6) === breakoutSign && riskOpen;
  const volumeBreakScore = breakoutSign * strength(56 + Math.min(22, Math.max(0, volumeZ) * 10) + Math.abs(obv) * 22 + Math.min(12, Math.abs(roc6) * 5));

  const squeezeDirection = sameNonZeroSign(roc6, macdHist) ? signOrZero(roc6) : 0;
  const squeezeActive = squeezeDirection !== 0 && Number(f.priorBbWidthPercentile || 50) <= 28 && Number(f.bbWidthExpansionRatio || 1) >= 1.12 && Math.abs(roc6) >= .45 && riskOpen;
  const squeezeScore = squeezeDirection * strength(50 + Math.min(25, (Number(f.bbWidthExpansionRatio || 1) - 1) * 70) + Math.min(18, Math.abs(roc6) * 7));

  const rangeLong = regime === 'range' && bbZ <= -1 && rsi <= 40 && Number(f.stochastic14 || 50) <= 35 && channelPos <= .28;
  const rangeShort = regime === 'range' && bbZ >= 1 && rsi >= 60 && Number(f.stochastic14 || 50) >= 65 && channelPos >= .72;
  const rangeSign = rangeLong ? 1 : rangeShort ? -1 : 0;
  const rangeScore = rangeSign * strength(45 + Math.min(25, Math.abs(bbZ) * 12) + Math.min(18, Math.abs(rsi - 50) * .7));

  const priorBreak = Number(f.previousBreakSign || 0);
  const rejectedHigh = priorBreak > 0 && f.currentInsideChannel && Number(f.anatomy?.upperWickPct || 0) >= .28 && closeLoc <= .48;
  const rejectedLow = priorBreak < 0 && f.currentInsideChannel && Number(f.anatomy?.lowerWickPct || 0) >= .28 && closeLoc >= .52;
  const failedBreakSign = rejectedHigh ? -1 : rejectedLow ? 1 : 0;
  const failedBreakActive = failedBreakSign !== 0 && riskOpen;
  const rejectionWick = failedBreakSign > 0 ? Number(f.anatomy?.lowerWickPct || 0) : Number(f.anatomy?.upperWickPct || 0);
  const failedBreakScore = failedBreakSign * strength(50 + rejectionWick * 55 + Math.min(12, Math.abs(Number(f.prev1?.volumeZScore || 0)) * 5));

  const structureSign = signOrZero(structure);
  const structureActive = regime === 'trend' && maSign !== 0 && structureSign === maSign && Math.abs(structure) >= .22 && (signOrZero(roc6) === maSign || Math.abs(roc6) < .25) && adx >= 18 && riskOpen;
  const structureScore = maSign * strength(44 + Math.abs(structure) * 30 + Math.max(0, adx - 18) * .8 + efficiency * 18);

  const momentumSign = sameNonZeroSign(roc6, roc24, macdHist) ? signOrZero(roc6) : 0;
  const momentumNotExtreme = momentumSign > 0 ? rsi < 74 : momentumSign < 0 ? rsi > 26 : false;
  const momentumActive = ['trend','volatile'].includes(regime) && momentumSign !== 0 && momentumNotExtreme && Math.abs(roc6) >= .35 && Math.abs(roc24) >= .7 && riskOpen;
  const momentumScore = momentumSign * strength(46 + Math.min(22, Math.abs(roc6) * 6) + Math.min(18, Math.abs(roc24) * 2.2) + efficiency * 16);

  const obvSign = signOrZero(obv);
  const obvTrendActive = regime === 'trend' && maSign !== 0 && obvSign === maSign && volumeZ > -1.1 && adx >= 18 && riskOpen;
  const obvTrendScore = maSign * strength(42 + Math.abs(obv) * 34 + Math.max(0, volumeZ + 1.1) * 6 + Math.max(0, adx - 18) * .65);

  const volMomentumSign = sameNonZeroSign(roc6, macdHist) ? signOrZero(roc6) : 0;
  const volExpansion = regime === 'volatile' || atrPctile >= 66 || rvPctile >= 66;
  const volMomentumActive = volExpansion && volMomentumSign !== 0 && Math.abs(roc6) >= .55 && riskOpen && ((volMomentumSign > 0 && closeLoc >= .58) || (volMomentumSign < 0 && closeLoc <= .42));
  const volMomentumScore = volMomentumSign * strength(48 + Math.min(20, Math.abs(roc6) * 7) + Math.max(0, Math.max(atrPctile, rvPctile) - 60) * .45 + Math.abs(closeLoc - .5) * 24);

  const exhaustionHigh = ['volatile','range'].includes(regime) && bbZ >= 1.55 && rsi >= 68 && Math.max(atrPctile, rvPctile) >= 68 && Number(f.anatomy?.upperWickPct || 0) >= .22;
  const exhaustionLow = ['volatile','range'].includes(regime) && bbZ <= -1.55 && rsi <= 32 && Math.max(atrPctile, rvPctile) >= 68 && Number(f.anatomy?.lowerWickPct || 0) >= .22;
  const exhaustionSign = exhaustionHigh ? -1 : exhaustionLow ? 1 : 0;
  const exhaustionWick = exhaustionSign > 0 ? Number(f.anatomy?.lowerWickPct || 0) : Number(f.anatomy?.upperWickPct || 0);
  const exhaustionScore = exhaustionSign * strength(46 + Math.min(22, Math.abs(bbZ) * 10) + exhaustionWick * 45 + Math.min(14, Math.abs(rsi - 50) * .55));

  const qualityActive = regime === 'trend' && maSign !== 0 && efficiency >= .42 && adx >= 20 && signOrZero(roc24) === maSign && signOrZero(Number(f.fastSlopePct || 0)) === maSign && riskOpen;
  const qualityScore = maSign * strength(45 + efficiency * 42 + Math.max(0, adx - 20) * .75 + Math.min(15, Math.abs(roc24) * 1.5));

  const playbooks = [
    alpha('PB_TREND_PULLBACK_001','Trend Pullback Continuation','continuation',pullbackScore,pullbackSign !== 0 && riskOpen,'Trend-regime retracement toward fast MA with recovery confirmation',{ maSign,pullbackDistance,rsi,roc6,closeLoc,efficiency }),
    alpha('PB_TREND_BREAKOUT_001','Trend Breakout Continuation','breakout',trendBreakScore,trendBreakActive,'Fresh Donchian break aligned with trend/ADX/structure',{ breakoutSign,maSign,adx,structure,efficiency }),
    alpha('PB_VOLUME_BREAKOUT_001','Volume-confirmed Breakout','breakout',volumeBreakScore,volumeBreakActive,'Breakout confirmed by abnormal participation and OBV',{ breakoutSign,volumeZ,obv,roc6 }),
    alpha('PB_SQUEEZE_EXPANSION_001','Volatility Squeeze Expansion','breakout',squeezeScore,squeezeActive,'Recent compression followed by width expansion and aligned momentum',{ priorBbWidthPercentile:f.priorBbWidthPercentile,bbWidthExpansionRatio:f.bbWidthExpansionRatio,roc6,macdHist }),
    alpha('PB_RANGE_MEAN_REVERSION_001','Range Mean Reversion','reversion',rangeScore,rangeSign !== 0 && riskOpen,'Range-regime distribution stretch and oscillator extreme',{ bbZ,rsi,stochastic:f.stochastic14,channelPos }),
    alpha('PB_FAILED_BREAKOUT_REVERSAL_001','Failed Breakout Reversal','reversal',failedBreakScore,failedBreakActive,'Prior channel escape rejected back inside the range',{ priorBreak,currentInsideChannel:f.currentInsideChannel,closeLoc,rejectionWick }),
    alpha('PB_STRUCTURE_CONTINUATION_001','Structure Continuation','continuation',structureScore,structureActive,'HH/HL or LH/LL structure aligns with trend',{ structure,maSign,roc6,adx,efficiency }),
    alpha('PB_MOMENTUM_CONTINUATION_001','Multi-horizon Momentum Continuation','continuation',momentumScore,momentumActive,'ROC6/ROC24/MACD directional agreement without severe oscillator extension',{ roc6,roc24,macdHist,rsi,efficiency }),
    alpha('PB_OBV_TREND_CONFIRM_001','OBV-confirmed Trend','continuation',obvTrendScore,obvTrendActive,'Price trend confirmed by OBV and acceptable participation',{ maSign,obv,volumeZ,adx }),
    alpha('PB_VOL_EXPANSION_MOMENTUM_001','Volatility Expansion Momentum','continuation',volMomentumScore,volMomentumActive,'Elevated volatility with directional momentum and directional close',{ atrPctile,rvPctile,roc6,macdHist,closeLoc,riskGate }),
    alpha('PB_EXHAUSTION_REVERSAL_001','Volatility Exhaustion Reversal','reversion',exhaustionScore,exhaustionSign !== 0 && riskOpen,'High-volatility distribution stretch with rejection wick',{ bbZ,rsi,atrPctile,rvPctile,exhaustionWick }),
    alpha('PB_TREND_QUALITY_001','Efficient Trend Continuation','continuation',qualityScore,qualityActive,'High path efficiency filters trend continuation',{ efficiency,adx,maSign,roc24,fastSlopePct:f.fastSlopePct }),
  ];

  const lowQualityBreak = breakoutSign !== 0 && (volumeZ < -.25 || efficiency < .18) && (Number(f.bbWidthPercentile || 50) <= 38 || adx < 20);
  const gates = [
    gate('PB_LOW_QUALITY_BREAKOUT_GATE_001','Low-quality Breakout Chase Gate',lowQualityBreak,breakoutSign,'Suppress same-direction chase when breakout lacks participation/path quality',{ breakoutSign,volumeZ,efficiency,bbWidthPercentile:f.bbWidthPercentile,adx }),
  ];

  return { playbooks, gates };
}

export function aggregatePlaybookArchetypes(playbooks = []) {
  const archetypes = {};
  for (const archetype of PLAYBOOK_ARCHETYPES) {
    const members = playbooks.filter(item => item.role === 'alpha' && item.archetype === archetype && item.active !== false);
    const score = members.length ? members.reduce((sum, item) => sum + Number(item.score || 0), 0) / members.length : 0;
    archetypes[archetype] = {
      archetype,
      score:round(clamp(score,-100,100)),
      memberCount:members.length,
      memberIds:members.map(item => item.id),
    };
  }
  const active = Object.values(archetypes).filter(item => item.memberCount > 0);
  const compositeScore = active.length ? active.reduce((sum, item) => sum + item.score, 0) / active.length : 0;
  const sign = Math.sign(compositeScore);
  const meaningful = active.filter(item => Math.abs(item.score) >= 8);
  const aligned = meaningful.filter(item => Math.sign(item.score) === sign).length;
  return {
    version:'playbook-archetype-normalization-0.1',
    equalArchetypeWeight:true,
    correlatedPlaybookCountDoesNotIncreaseArchetypeWeight:true,
    archetypes,
    activeArchetypeCount:active.length,
    activePlaybookCount:playbooks.filter(item => item.active && item.role === 'alpha').length,
    compositeScore:round(clamp(compositeScore,-100,100)),
    archetypeAgreement:round(meaningful.length ? aligned / meaningful.length : 0,3),
  };
}

export function rebuildPlaybookDecision({ context, playbooks = [], gates = [] } = {}) {
  const aggregation = aggregatePlaybookArchetypes(playbooks);
  const score = Number(aggregation.compositeScore || 0);
  const scoreSign = Math.sign(score);
  const activeScores = playbooks.filter(item => item.active && item.role === 'alpha').map(item => Math.abs(Number(item.score || 0)));
  const maxSetupStrength = activeScores.length ? Math.max(...activeScores) : 0;
  const enoughSetupEvidence = aggregation.activePlaybookCount >= 2 || maxSetupStrength >= 70;
  let entryDecision = 'NO_ENTRY';
  let gateReason = null;
  if (context?.riskGate !== 'BLOCK' && enoughSetupEvidence && aggregation.archetypeAgreement >= .5) {
    if (score >= 26) entryDecision = 'ENTER_LONG';
    else if (score <= -26) entryDecision = 'ENTER_SHORT';
  }
  if (entryDecision !== 'NO_ENTRY') {
    const blocked = gates.find(item => item.active && item.blockedDirectionSign === scoreSign);
    if (blocked) {
      entryDecision = 'NO_ENTRY';
      gateReason = blocked.id;
    }
  }
  return { entryDecision, aggregation, gateReason, maxSetupStrength, enoughSetupEvidence };
}

function ranked(playbooks, direction = 1) {
  return playbooks
    .filter(item => item.active && item.role === 'alpha')
    .slice()
    .sort((a,b) => direction * (Number(b.score) - Number(a.score)))
    .slice(0,6)
    .map(item => ({ id:item.id,label:item.label,archetype:item.archetype,score:item.score }));
}

export class HumanPlaybookEngine {
  constructor() {
    this.version = HUMAN_PLAYBOOK_ENGINE_VERSION;
    this.registryVersion = HUMAN_PLAYBOOK_REGISTRY_VERSION;
    this.researchOnly = true;
    this.wave1 = new HumanKnowledgeEngine();
  }

  analyze(series, idx) {
    if (!Array.isArray(series) || idx < 55 || !series[idx]) {
      return { version:this.version,status:'unavailable',reason:'insufficient-history',researchOnly:true };
    }
    const wave1 = this.wave1.analyze(series, idx);
    if (wave1.status !== 'complete') {
      return { version:this.version,status:'unavailable',reason:'wave1-unavailable',researchOnly:true };
    }
    const features = buildPlaybookFeatures(series, idx);
    const { playbooks, gates } = runHumanPlaybooks(features, wave1.context);
    const decision = rebuildPlaybookDecision({ context:wave1.context, playbooks, gates });
    const direction = decision.aggregation.compositeScore > 5 ? 'UP' : decision.aggregation.compositeScore < -5 ? 'DOWN' : 'NEUTRAL';
    return {
      version:this.version,
      registryVersion:this.registryVersion,
      status:'complete',
      researchOnly:true,
      wave:2,
      idx,
      candleTime:Number(series[idx]?.t) || null,
      price:Number(series[idx]?.c) || null,
      direction,
      entryDecision:decision.entryDecision,
      playbookScore:decision.aggregation.compositeScore,
      scoreIsExpectedReturn:false,
      confidenceIsCalibratedProbability:false,
      archetypeAgreement:decision.aggregation.archetypeAgreement,
      activePlaybookCount:decision.aggregation.activePlaybookCount,
      activeArchetypeCount:decision.aggregation.activeArchetypeCount,
      maxSetupStrength:round(decision.maxSetupStrength),
      gateReason:decision.gateReason,
      context:wave1.context,
      wave1Reference:{
        version:wave1.version,
        knowledgeScore:wave1.knowledgeScore,
        entryDecision:wave1.entryDecision,
        familyAgreement:wave1.familyAgreement,
      },
      aggregation:decision.aggregation,
      archetypes:decision.aggregation.archetypes,
      playbooks,
      gates,
      topSupport:ranked(playbooks,1),
      topOpposition:ranked(playbooks,-1),
      features:{
        efficiencyRatio20:round(features.efficiencyRatio20,3),
        priceToFastAtr:round(features.priceToFastAtr),
        closeLocation:round(features.anatomy?.closeLocation,3),
        upperWickPct:round(features.anatomy?.upperWickPct,3),
        lowerWickPct:round(features.anatomy?.lowerWickPct,3),
        bbWidthExpansionRatio:round(features.bbWidthExpansionRatio,3),
        priorBbWidthPercentile:round(features.priorBbWidthPercentile),
        donchianBreakSign:features.donchianBreakSign,
        previousBreakSign:features.previousBreakSign,
      },
      governance:{
        preRegisteredWave:true,
        championMutation:false,
        usedByLiveDecisionEngine:false,
        usedByForwardEvidence:false,
        optimizer:false,
        parameterSweep:false,
        selfLearning:false,
        adaptiveWeights:false,
        automaticPruning:false,
        automaticPromotion:false,
      },
    };
  }

  registrySnapshot() {
    return getHumanPlaybookRegistrySnapshot();
  }
}
