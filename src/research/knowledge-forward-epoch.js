import { HUMAN_KNOWLEDGE_ENGINE_VERSION } from '../knowledge/human-knowledge-engine.js';
import { HUMAN_PLAYBOOK_ENGINE_VERSION } from '../knowledge/playbook-engine.js';
import { RESEARCH_COST_MODEL_VERSION } from './research-cost-model.js';
import { KNOWLEDGE_CANDIDATE_REGISTRY, KNOWLEDGE_CANDIDATE_REGISTRY_VERSION, KNOWLEDGE_CANDIDATE_HORIZON_BARS } from './knowledge-candidate-registry.js';
import { KNOWLEDGE_CANDIDATE_TOURNAMENT_VERSION } from './knowledge-candidate-tournament.js';

export const KNOWLEDGE_FORWARD_EPOCH_VERSION = 'knowledge-forward-epoch-0.1';
export const KNOWLEDGE_FORWARD_EPOCH_ID = 'knowledge-forward-001';
export const KNOWLEDGE_FORWARD_FREEZE_ISO = '2026-08-16T22:58:14Z';
export const KNOWLEDGE_FORWARD_FREEZE_UNIX = 1786921094;
export const KNOWLEDGE_FORWARD_FROZEN_MAIN = '828a0ccadded2c19fd1bde634dfdd77f348fa8d8';
export const KNOWLEDGE_FORWARD_CHAMPION_VERSION = '0.4-fixed-experts-policy';

export const KNOWLEDGE_FORWARD_CANDIDATE_IDS = Object.freeze([
  'candidate-wave1-reference',
  'candidate-playbook-reference',
  'candidate-consensus',
  'candidate-playbook-wave1-veto',
]);

export const KNOWLEDGE_FORWARD_EPOCH = Object.freeze({
  version:KNOWLEDGE_FORWARD_EPOCH_VERSION,
  id:KNOWLEDGE_FORWARD_EPOCH_ID,
  frozenAtIso:KNOWLEDGE_FORWARD_FREEZE_ISO,
  frozenAtUnix:KNOWLEDGE_FORWARD_FREEZE_UNIX,
  frozenAtLocal:'2026-08-17 07:58:14 JST',
  frozenMainCommit:KNOWLEDGE_FORWARD_FROZEN_MAIN,
  instrument:'BTCUSD',
  timeframeHours:4,
  horizonBars:KNOWLEDGE_CANDIDATE_HORIZON_BARS,
  candidateRegistryVersion:KNOWLEDGE_CANDIDATE_REGISTRY_VERSION,
  tournamentVersion:KNOWLEDGE_CANDIDATE_TOURNAMENT_VERSION,
  wave1Version:HUMAN_KNOWLEDGE_ENGINE_VERSION,
  wave2Version:HUMAN_PLAYBOOK_ENGINE_VERSION,
  championVersion:KNOWLEDGE_FORWARD_CHAMPION_VERSION,
  researchCostModelVersion:RESEARCH_COST_MODEL_VERSION,
  candidateIds:KNOWLEDGE_FORWARD_CANDIDATE_IDS,
  benchmark:Object.freeze({ id:'champion-001',role:'matched-prospective-benchmark',candidate:false }),
  eligibility:Object.freeze({
    candleOpenTimestampStrictlyAfterFreeze:true,
    fullyClosedBarsOnly:true,
    entryTimestampStrictlyAfterFreeze:true,
    exitTimestampStrictlyAfterFreeze:true,
    exitMustBeFullyObserved:true,
    preFreezeBarsIndicatorContextOnly:true,
    preFreezePnlForbidden:true,
  }),
  governance:Object.freeze({
    fixedCandidateCount:4,
    candidateMutation:false,
    championMutation:false,
    fitting:false,
    optimizer:false,
    parameterSweep:false,
    selfLearning:false,
    adaptiveWeights:false,
    automaticSelection:false,
    automaticPromotion:false,
    promotionEligible:false,
    humanReviewRequired:true,
  }),
});

export function assertKnowledgeForwardEpochRuntime() {
  const ids = KNOWLEDGE_CANDIDATE_REGISTRY.candidates.map(item => item.id);
  const expected = [...KNOWLEDGE_FORWARD_CANDIDATE_IDS];
  const checks = [
    [KNOWLEDGE_CANDIDATE_REGISTRY_VERSION === 'knowledge-candidate-registry-0.1','candidate-registry-version-mismatch'],
    [KNOWLEDGE_CANDIDATE_TOURNAMENT_VERSION === 'knowledge-candidate-tournament-0.1','tournament-version-mismatch'],
    [HUMAN_KNOWLEDGE_ENGINE_VERSION === 'human-knowledge-wave1-0.1','wave1-version-mismatch'],
    [HUMAN_PLAYBOOK_ENGINE_VERSION === 'human-playbook-wave2-0.1','wave2-version-mismatch'],
    [RESEARCH_COST_MODEL_VERSION === 'research-cost-v0.1','cost-model-version-mismatch'],
    [KNOWLEDGE_CANDIDATE_HORIZON_BARS === 3,'horizon-mismatch'],
    [JSON.stringify(ids) === JSON.stringify(expected),'candidate-set-mismatch'],
    [KNOWLEDGE_CANDIDATE_REGISTRY.governance?.fixedCandidateCount === 4,'candidate-count-governance-mismatch'],
    [KNOWLEDGE_CANDIDATE_REGISTRY.governance?.automaticPromotion === false,'candidate-governance-mismatch'],
  ];
  const failed = checks.find(([ok]) => !ok);
  if (failed) throw new Error(`knowledge-forward-runtime-version-mismatch:${failed[1]}`);
  return true;
}
