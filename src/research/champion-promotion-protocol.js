import { KNOWLEDGE_CANDIDATE_REGISTRY } from './knowledge-candidate-registry.js';
import { KNOWLEDGE_FORWARD_EPOCH_ID, KNOWLEDGE_FORWARD_FREEZE_UNIX } from './knowledge-forward-epoch.js';
import { FROZEN_KNOWLEDGE_EVALUATOR_COMMIT } from './knowledge-forward-remote.js';

export const CHAMPION_PROMOTION_PROTOCOL_VERSION = 'champion-promotion-protocol-0.1';
export const CHAMPION_PROMOTION_REGISTERED_AT_ISO = '2026-08-16T23:54:09Z';
export const CHAMPION_PROMOTION_QUALIFICATION_EPOCH_ID = KNOWLEDGE_FORWARD_EPOCH_ID;
export const CHAMPION_PROMOTION_CONFIRMATION_EPOCH_ID = 'knowledge-confirm-001';
export const CHAMPION_PROMOTION_BENCHMARK_ID = 'champion-001';
export const CHAMPION_PROMOTION_CANDIDATE_IDS = Object.freeze(KNOWLEDGE_CANDIDATE_REGISTRY.candidates.map(item => item.id));
export const CHAMPION_PROMOTION_LAG_CONTROLS = Object.freeze([1,2,3,6,9,12,18,24]);

export const CHAMPION_PROMOTION_STAGE_A = Object.freeze({
  purpose:'qualification-only',
  freezeUnix:KNOWLEDGE_FORWARD_FREEZE_UNIX,
  minElapsedCalendarDays:90,
  minObservedBars:540,
  minCandidateTrades:30,
  minBenchmarkTrades:30,
  chronologicalFolds:3,
  minTradesPerFoldPerSource:5,
  minPositiveCandidateFolds:2,
  minBenchmarkBeatFolds:2,
  lagControls:[...CHAMPION_PROMOTION_LAG_CONTROLS],
  requiredFiniteLagReplicates:8,
  minTradesPerLagReplicate:10,
  requirePositiveCandidateReturn:true,
  requirePositiveCandidateAvgNetBps:true,
  requireBeatChampionAvgNetBps:true,
  requireAboveLagNull95:true,
  requireZeroMarketGaps:true,
  requireZeroObservedBarGaps:true,
  requireRemoteCollectorRun:true,
  requireFrozenEvaluatorCommit:FROZEN_KNOWLEDGE_EVALUATOR_COMMIT,
  resultCanOnlyBe:'confirmationReviewReady',
  directPromotionForbidden:true,
});

export const CHAMPION_PROMOTION_STAGE_B = Object.freeze({
  purpose:'single-candidate-untouched-confirmation',
  epochId:CHAMPION_PROMOTION_CONFIRMATION_EPOCH_ID,
  createOnlyAfterStageAReview:true,
  maxCandidates:1,
  freezeAfterNomination:true,
  preNominationDataForbidden:true,
  minElapsedCalendarDays:90,
  minCandidateTrades:30,
  minBenchmarkTrades:30,
  chronologicalFolds:3,
  minTradesPerFoldPerSource:5,
  minPositiveCandidateFolds:2,
  minBenchmarkBeatFolds:2,
  requirePositiveCandidateReturn:true,
  requirePositiveCandidateAvgNetBps:true,
  requireBeatChampionAvgNetBps:true,
  requireNegativeControlReview:true,
  requireExecutionCostReview:true,
  requireHumanPromotionReview:true,
  automaticPromotion:false,
});

export const CHAMPION_PROMOTION_PROTOCOL = Object.freeze({
  version:CHAMPION_PROMOTION_PROTOCOL_VERSION,
  registeredAtIso:CHAMPION_PROMOTION_REGISTERED_AT_ISO,
  registeredBeforeFirstAutonomousCollectorRun:true,
  qualificationEpochId:CHAMPION_PROMOTION_QUALIFICATION_EPOCH_ID,
  confirmationEpochId:CHAMPION_PROMOTION_CONFIRMATION_EPOCH_ID,
  benchmarkId:CHAMPION_PROMOTION_BENCHMARK_ID,
  candidateIds:[...CHAMPION_PROMOTION_CANDIDATE_IDS],
  stageA:CHAMPION_PROMOTION_STAGE_A,
  stageB:CHAMPION_PROMOTION_STAGE_B,
  governance:{
    fixedCandidateCount:4,
    generatedCandidates:false,
    thresholdSearch:false,
    parameterSweep:false,
    optimizer:false,
    selfLearning:false,
    adaptiveWeights:false,
    automaticSelection:false,
    automaticNomination:false,
    automaticPromotion:false,
    championMutation:false,
    qualificationDataCannotBeConfirmationData:true,
    humanReviewRequired:true,
    realMoneyRouting:false,
  },
  interpretation:{
    thresholdsAreGovernanceMinimumsNotStatisticalProof:true,
    lagNull95IsScreeningNotFormalPValue:true,
    stageAResultIsNotPromotion:true,
    stageBStillRequiresExplicitChampion002CodeChange:true,
  },
});

export function assertChampionPromotionProtocol() {
  if (CHAMPION_PROMOTION_CANDIDATE_IDS.length !== 4) throw new Error('champion-promotion-candidate-count-drift');
  if (new Set(CHAMPION_PROMOTION_CANDIDATE_IDS).size !== 4) throw new Error('champion-promotion-candidate-id-drift');
  if (CHAMPION_PROMOTION_STAGE_A.requireFrozenEvaluatorCommit !== FROZEN_KNOWLEDGE_EVALUATOR_COMMIT) throw new Error('champion-promotion-evaluator-commit-drift');
  if (CHAMPION_PROMOTION_STAGE_A.directPromotionForbidden !== true || CHAMPION_PROMOTION_STAGE_B.automaticPromotion !== false) throw new Error('champion-promotion-governance-drift');
  return true;
}
