export const STRATEGY_REGISTRY_VERSION = 'strategy-registry-0.1';
export const MAX_CHALLENGERS = 3;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

const registry = {
  version: STRATEGY_REGISTRY_VERSION,
  champion: {
    id: 'champion-001',
    label: 'Champion',
    role: 'champion',
    frozen: true,
    liveDecisionEngine: true,
    engineVersion: '0.4-fixed-experts-policy',
    hypothesis: 'Current live/demo Shadow Engine behavior; immutable comparison anchor for v0.7 research.',
    variant: {
      type: 'live-shadow-engine',
      decisionThreshold: 42,
      confidenceThreshold: 61,
    },
    promotion: {
      automatic: false,
      eligibleFromSameSeriesOnly: false,
    },
  },
  challengers: [
    {
      id: 'challenger-001-stricter-entry',
      label: 'Stricter Entry',
      role: 'challenger',
      frozenDefinition: true,
      liveDecisionEngine: false,
      hypothesis: 'A stronger NO_ENTRY bias may improve net outcomes by requiring both higher decision score and confidence.',
      variant: {
        type: 'entry-threshold',
        decisionThreshold: 48,
        confidenceThreshold: 64,
      },
    },
    {
      id: 'challenger-002-trend-tilt',
      label: 'Trend Tilt',
      role: 'challenger',
      frozenDefinition: true,
      liveDecisionEngine: false,
      hypothesis: 'A modest fixed increase in Trend Expert influence may help when directional persistence is real.',
      variant: {
        type: 'trend-weight',
        trendWeight: 1.25,
        decisionThreshold: 42,
        confidenceThreshold: 61,
      },
    },
    {
      id: 'challenger-003-momentum-confirm',
      label: 'Momentum Confirm',
      role: 'challenger',
      frozenDefinition: true,
      liveDecisionEngine: false,
      hypothesis: 'Rejecting entries when Momentum Expert points against the intended direction may reduce conflicting-signal trades.',
      variant: {
        type: 'momentum-confirmation',
        allowNeutralMomentum: true,
      },
    },
  ],
  governance: {
    challengerLimit: MAX_CHALLENGERS,
    parameterSweep: false,
    dynamicWeightLearning: false,
    selfLearning: false,
    automaticPromotion: false,
    sameSeriesResultsCanPromoteChampion: false,
    requiredBeforeFuturePromotion: [
      'predeclared-hypothesis',
      'out-of-sample-validation',
      'negative-control-review',
      'forward-demo-observation',
      'human-approval',
    ],
  },
};

export const STRATEGY_REGISTRY = deepFreeze(registry);

export function getChampionStrategy() {
  return STRATEGY_REGISTRY.champion;
}

export function getChallengerStrategies() {
  return STRATEGY_REGISTRY.challengers;
}

export function getStrategyRegistrySnapshot() {
  return JSON.parse(JSON.stringify(STRATEGY_REGISTRY));
}
