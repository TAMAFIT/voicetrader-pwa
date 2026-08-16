export const FORWARD_EPOCH_VERSION = 'forward-epoch-0.1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

const epoch = {
  version: FORWARD_EPOCH_VERSION,
  id: 'forward-001',
  label: 'Forward Demo 001',
  frozenAtIso: '2026-08-16T14:27:00Z',
  frozenAtJst: '2026-08-16 23:27 JST',
  frozenAtUnix: 1786890420,
  instrument: 'BTCUSD',
  timeframeHours: 4,
  firstEligibleCandleRule: 'closed candle open timestamp must be strictly greater than frozenAtUnix',
  startsFlatAtFreeze: true,
  horizonBars: 3,
  provenance: {
    frozenCodeBaseCommit: 'd81aa5e0d480b7d8e94cf86307d83cf6c858a128',
    strategyRegistryVersion: 'strategy-registry-0.1',
    shadowEngineVersion: '0.4-fixed-experts-policy',
    decisionEvaluatorVersion: 'challenger-shadow-0.1',
    executionProfile: 'estimated-v0.3',
  },
  strategies: [
    {
      id: 'champion-001',
      label: 'Champion',
      role: 'champion',
      frozen: true,
      liveDecisionEngine: true,
      hypothesis: 'Current live/demo Shadow Engine behavior frozen as the prospective comparison anchor.',
      variant: { type: 'live-shadow-engine', decisionThreshold: 42, confidenceThreshold: 61 },
    },
    {
      id: 'challenger-001-stricter-entry',
      label: 'Stricter Entry',
      role: 'challenger',
      frozenDefinition: true,
      liveDecisionEngine: false,
      hypothesis: 'A stronger NO_ENTRY bias may improve net outcomes by requiring both higher decision score and confidence.',
      variant: { type: 'entry-threshold', decisionThreshold: 48, confidenceThreshold: 64 },
    },
    {
      id: 'challenger-002-trend-tilt',
      label: 'Trend Tilt',
      role: 'challenger',
      frozenDefinition: true,
      liveDecisionEngine: false,
      hypothesis: 'A modest fixed increase in Trend Expert influence may help when directional persistence is real.',
      variant: { type: 'trend-weight', trendWeight: 1.25, decisionThreshold: 42, confidenceThreshold: 61 },
    },
    {
      id: 'challenger-003-momentum-confirm',
      label: 'Momentum Confirm',
      role: 'challenger',
      frozenDefinition: true,
      liveDecisionEngine: false,
      hypothesis: 'Rejecting entries when Momentum Expert points against the intended direction may reduce conflicting-signal trades.',
      variant: { type: 'momentum-confirmation', allowNeutralMomentum: true },
    },
  ],
  governance: {
    parameterSweep: false,
    optimization: false,
    selfLearning: false,
    dynamicWeightLearning: false,
    automaticPromotion: false,
    promotionEligible: false,
    forwardEvidenceNecessaryButNotSufficient: true,
    humanApprovalRequired: true,
    negativeControlReviewRequired: true,
  },
};

export const FORWARD_EPOCH = deepFreeze(epoch);

export function getForwardEpochSnapshot() {
  return JSON.parse(JSON.stringify(FORWARD_EPOCH));
}
