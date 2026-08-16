export const KNOWLEDGE_CANDIDATE_REGISTRY_VERSION = 'knowledge-candidate-registry-0.1';
export const KNOWLEDGE_CANDIDATE_HORIZON_BARS = 3;
export const KNOWLEDGE_CANDIDATE_START_INDEX = 120;
export const KNOWLEDGE_CANDIDATE_LAGS = Object.freeze([5,7,11,13,17,23,29,37]);
export const KNOWLEDGE_CANDIDATE_FOLDS = 3;
export const KNOWLEDGE_CANDIDATE_EMBARGO_BARS = 3;
export const WAVE1_STRONG_OPPOSITION_THRESHOLD = 22;

const candidate = ({ id,label,hypothesis,rule }) => Object.freeze({
  id,label,hypothesis,rule,
  preRegistered:true,
  researchOnly:true,
  frozenForTournament:true,
  activeInChampion:false,
  activeInLiveForward:false,
  activeInForwardEvidence:false,
  optimizer:false,
  parameterSweep:false,
  adaptiveWeights:false,
  selfLearning:false,
  automaticSelection:false,
  automaticPromotion:false,
});

export const KNOWLEDGE_CANDIDATE_REGISTRY = Object.freeze({
  version:KNOWLEDGE_CANDIDATE_REGISTRY_VERSION,
  frozenAtBaseMain:'515aad8a57c1414f9be23598ab0253bc0913a8d3',
  instrument:'BTCUSD',
  timeframeHours:4,
  horizonBars:KNOWLEDGE_CANDIDATE_HORIZON_BARS,
  startIndex:KNOWLEDGE_CANDIDATE_START_INDEX,
  signalLagControls:Object.freeze([...KNOWLEDGE_CANDIDATE_LAGS]),
  folds:KNOWLEDGE_CANDIDATE_FOLDS,
  embargoBars:KNOWLEDGE_CANDIDATE_EMBARGO_BARS,
  benchmark:Object.freeze({
    id:'champion-001',
    label:'Frozen Champion 001',
    role:'benchmark',
    frozen:true,
    automaticReplacement:false,
  }),
  candidates:Object.freeze([
    candidate({
      id:'candidate-wave1-reference',
      label:'Wave 1 Reference',
      hypothesis:'Indicator-family Human Knowledge is useful as a transparent reference candidate without Wave 2 setup routing.',
      rule:'Use HumanKnowledgeEngine entryDecision unchanged.',
    }),
    candidate({
      id:'candidate-playbook-reference',
      label:'Wave 2 Playbook Reference',
      hypothesis:'Regime-routed multi-condition Playbooks may improve timing/selectivity relative to indicator-family voting alone.',
      rule:'Use HumanPlaybookEngine entryDecision unchanged.',
    }),
    candidate({
      id:'candidate-consensus',
      label:'Wave 1 + Wave 2 Consensus',
      hypothesis:'Requiring independent Wave 1 and Wave 2 layers to agree on the same entry side may trade less but reduce conflicting entries.',
      rule:'Enter only when Wave 1 and Wave 2 both return the same non-NO_ENTRY decision.',
    }),
    candidate({
      id:'candidate-playbook-wave1-veto',
      label:'Playbook + Wave 1 Strong-Opposition Veto',
      hypothesis:'Use the setup-specific Playbook entry, but reject it when Wave 1 composite evidence strongly points the opposite way.',
      rule:`Use Wave 2 entry unless Wave 1 knowledgeScore has opposite sign and absolute magnitude >= ${WAVE1_STRONG_OPPOSITION_THRESHOLD}; otherwise NO_ENTRY.`,
    }),
  ]),
  governance:Object.freeze({
    fixedCandidateCount:4,
    generatedCombinations:false,
    combinatorialSearch:false,
    rawScoreMinusCost:false,
    costAppliedToRealizedTradeReturnsOnly:true,
    sameSeriesResultsCanPromote:false,
    holdoutResultsCanPromote:false,
    prospectiveEvidenceRequired:true,
    humanReviewRequired:true,
    automaticSelection:false,
    automaticPromotion:false,
    championMutation:false,
  }),
});

export function getKnowledgeCandidateRegistrySnapshot() {
  return JSON.parse(JSON.stringify(KNOWLEDGE_CANDIDATE_REGISTRY));
}
