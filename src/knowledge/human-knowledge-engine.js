import { clamp } from '../engine/indicators.js';
import { buildKnowledgeFeatures } from './knowledge-indicators.js';
import { aggregateFamilies, buildRegimeAndRiskContext, runHumanAlphaExperts } from './expert-library.js';
import { getKnowledgeRegistrySnapshot } from './knowledge-registry.js';

export const HUMAN_KNOWLEDGE_ENGINE_VERSION = 'human-knowledge-wave1-0.1';

const round = (value, digits = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

function candidateDecision({ compositeScore, familyAgreement, context }) {
  if (context.riskGate === 'BLOCK') return 'NO_ENTRY';
  if (compositeScore >= 22 && familyAgreement >= .5) return 'ENTER_LONG';
  if (compositeScore <= -22 && familyAgreement >= .5) return 'ENTER_SHORT';
  return 'NO_ENTRY';
}

function rankedExperts(experts, direction = 1) {
  return experts
    .slice()
    .sort((a, b) => direction * (Number(b.score) - Number(a.score)))
    .slice(0, 5)
    .map(item => ({ id:item.id, label:item.label, family:item.family, score:item.score }));
}

export class HumanKnowledgeEngine {
  constructor() {
    this.version = HUMAN_KNOWLEDGE_ENGINE_VERSION;
    this.researchOnly = true;
  }

  analyze(series, idx) {
    if (!Array.isArray(series) || idx < 40 || !series[idx]) {
      return { version:this.version, status:'unavailable', reason:'insufficient-history', researchOnly:true };
    }
    const features = buildKnowledgeFeatures(series, idx);
    const experts = runHumanAlphaExperts(features);
    const aggregation = aggregateFamilies(experts);
    const context = buildRegimeAndRiskContext(features);
    const compositeScore = aggregation.compositeScore;
    const direction = compositeScore > 5 ? 'UP' : compositeScore < -5 ? 'DOWN' : 'NEUTRAL';
    const confidenceScore = round(clamp(50 + Math.abs(compositeScore) * .42 + aggregation.familyAgreement * 8, 50, 96));
    const entryDecision = candidateDecision({ compositeScore, familyAgreement:aggregation.familyAgreement, context });

    return {
      version: this.version,
      status: 'complete',
      researchOnly: true,
      idx,
      candleTime: Number(series[idx]?.t) || null,
      price: features.price,
      direction,
      knowledgeScore: compositeScore,
      confidenceScore,
      confidenceIsCalibratedProbability: false,
      scoreIsExpectedReturn: false,
      familyAgreement: aggregation.familyAgreement,
      entryDecision,
      context,
      families: aggregation.families,
      aggregation,
      experts,
      topSupport: rankedExperts(experts, 1),
      topOpposition: rankedExperts(experts, -1),
      features: {
        rsi14: round(features.rsi14),
        atr14Pct: round(features.atr14Pct),
        roc24Pct: round(features.roc24Pct),
        stochastic14: round(features.stochastic14),
        adx: round(features.dmi?.adx),
        bbZ: round(features.bollinger?.z),
        bbWidthPercentile: round(features.bbWidthPercentile),
        realizedVolPercentile: round(features.realizedVolPercentile),
        volumeZScore: round(features.volumeZScore),
      },
      governance: {
        championMutation: false,
        usedByLiveDecisionEngine: false,
        usedByForwardEvidence: false,
        optimizer: false,
        parameterSweep: false,
        selfLearning: false,
        adaptiveWeights: false,
        automaticPromotion: false,
      },
    };
  }

  registrySnapshot() {
    return getKnowledgeRegistrySnapshot();
  }
}
