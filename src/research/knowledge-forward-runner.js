import { HumanKnowledgeEngine } from '../knowledge/human-knowledge-engine.js';
import { HumanPlaybookEngine } from '../knowledge/playbook-engine.js';
import { ShadowEngine } from '../engine/shadow-engine.js';
import { buildCandidateDecision } from './knowledge-candidate-tournament.js';
import { KNOWLEDGE_CANDIDATE_REGISTRY } from './knowledge-candidate-registry.js';
import { estimateResearchRoundTripCostBps, RESEARCH_COST_MODEL_VERSION } from './research-cost-model.js';
import {
  KNOWLEDGE_FORWARD_EPOCH,
  KNOWLEDGE_FORWARD_EPOCH_ID,
  KNOWLEDGE_FORWARD_FREEZE_UNIX,
  assertKnowledgeForwardEpochRuntime,
} from './knowledge-forward-epoch.js';

export const KNOWLEDGE_FORWARD_RUNNER_VERSION = 'knowledge-forward-runner-0.1';
const FOUR_HOURS_SECONDS = 4 * 60 * 60;

const round = (value, digits = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

function sideFromDecision(decision) {
  if (decision === 'ENTER_LONG') return 'LONG';
  if (decision === 'ENTER_SHORT') return 'SHORT';
  return null;
}

function outcomeBps(series, entryIndex, exitIndex, side, costBps) {
  const entryPrice = Number(series[entryIndex]?.c);
  const exitPrice = Number(series[exitIndex]?.c);
  if (!(entryPrice > 0) || !(exitPrice > 0)) return null;
  const gross = side === 'LONG'
    ? (exitPrice / entryPrice - 1) * 10000
    : ((entryPrice - exitPrice) / entryPrice) * 10000;
  return {
    entryPrice,
    exitPrice,
    grossReturnBps:round(gross),
    netReturnBps:round(gross - Math.max(0,Number(costBps) || 0)),
  };
}

export function isKnowledgeForwardEligibleBar(bar) {
  return Number(bar?.t) > KNOWLEDGE_FORWARD_FREEZE_UNIX;
}

export function getKnowledgeForwardEligibleIndexes(series = [], endIndex = series.length - 1) {
  const safeEnd = Math.min(Number(endIndex ?? series.length - 1),series.length - 1);
  const out = [];
  for (let idx = 0; idx <= safeEnd; idx++) if (isKnowledgeForwardEligibleBar(series[idx])) out.push(idx);
  return out;
}

function candidateSnapshot(wave1,wave2,candidateId) {
  return {
    candidateId,
    decision:buildCandidateDecision(candidateId,wave1,wave2),
    wave1Decision:wave1.entryDecision,
    wave1KnowledgeScore:wave1.knowledgeScore,
    wave1FamilyAgreement:wave1.familyAgreement,
    wave2Decision:wave2.entryDecision,
    wave2PlaybookScore:wave2.playbookScore,
    wave2ArchetypeAgreement:wave2.archetypeAgreement,
    regime:wave1.context?.regime || 'unknown',
    riskGate:wave1.context?.riskGate || 'unknown',
  };
}

function decisionRecord({ sourceId,role,idx,series,decision,context,dataSignature,details }) {
  const candleTime = Number(series[idx]?.t) || null;
  return {
    decisionKey:`${KNOWLEDGE_FORWARD_EPOCH_ID}:${sourceId}:${candleTime}`,
    epochId:KNOWLEDGE_FORWARD_EPOCH_ID,
    sourceId,
    role,
    barIndex:idx,
    candleTime,
    decision,
    regime:context?.regime || details?.regime || 'unknown',
    riskGate:context?.riskGate || details?.riskGate || 'unknown',
    dataSignature,
    observedProspectively:true,
    usedFutureOutcomeAtDecision:false,
    details,
  };
}

function evidenceRecord({ sourceId,role,entryIndex,exitIndex,series,side,decision,context,costBps,dataSignature,details }) {
  const entryTime = Number(series[entryIndex]?.t) || null;
  const exitTime = Number(series[exitIndex]?.t) || null;
  const outcome = outcomeBps(series,entryIndex,exitIndex,side,costBps);
  if (!outcome) return null;
  return {
    evidenceKey:`${KNOWLEDGE_FORWARD_EPOCH_ID}:${sourceId}:${entryTime}:${exitTime}:${side}`,
    epochId:KNOWLEDGE_FORWARD_EPOCH_ID,
    sourceId,
    role,
    side,
    decision,
    entryIndex,
    exitIndex,
    entryTime,
    exitTime,
    holdingBars:KNOWLEDGE_FORWARD_EPOCH.horizonBars,
    regime:context?.regime || details?.regime || 'unknown',
    riskGate:context?.riskGate || details?.riskGate || 'unknown',
    estimatedRoundTripCostBps:round(costBps,4),
    costModelVersion:RESEARCH_COST_MODEL_VERSION,
    costUsesEntryBarInformationOnly:true,
    dataSignature,
    observedProspectively:true,
    futureOutcomeUsedByDecision:false,
    details,
    ...outcome,
  };
}

function evaluateSourcePath({ sourceId,role,series,eligibleIndexes,analyses,championAnalyses,dataSignature }) {
  const evidence = [];
  const decisions = [];
  let nextFreeIndex = eligibleIndexes.length ? eligibleIndexes[0] : Infinity;
  for (const idx of eligibleIndexes) {
    const pair = analyses.get(idx);
    const champion = championAnalyses.get(idx);
    if (!pair || !champion) continue;
    let decision, details, context;
    if (role === 'benchmark') {
      decision = champion.entryDecision;
      context = pair.wave1.context;
      details = { championVersion:champion.engineVersion, rawAlphaScore:champion.rawAlphaScore, decisionScore:champion.decisionScore, confidenceScore:champion.conf };
    } else {
      const snapshot = candidateSnapshot(pair.wave1,pair.wave2,sourceId);
      decision = snapshot.decision;
      context = pair.wave1.context;
      details = snapshot;
    }
    decisions.push(decisionRecord({ sourceId,role,idx,series,decision,context,dataSignature,details }));
    if (idx < nextFreeIndex) continue;
    const side = sideFromDecision(decision);
    if (!side) continue;
    const exitIndex = idx + KNOWLEDGE_FORWARD_EPOCH.horizonBars;
    if (!series[exitIndex]) continue;
    const entryTime = Number(series[idx]?.t);
    const exitTime = Number(series[exitIndex]?.t);
    if (!(entryTime > KNOWLEDGE_FORWARD_FREEZE_UNIX) || !(exitTime > KNOWLEDGE_FORWARD_FREEZE_UNIX)) continue;
    const costBps = estimateResearchRoundTripCostBps(series,idx,'BTCUSD');
    if (!Number.isFinite(Number(costBps))) continue;
    const record = evidenceRecord({ sourceId,role,entryIndex:idx,exitIndex,series,side,decision,context,costBps,dataSignature,details });
    if (!record) continue;
    evidence.push(record);
    nextFreeIndex = exitIndex + 1;
  }
  return { decisions,evidence };
}

export function detectKnowledgeForwardBarGaps(observedBarTimes = []) {
  const times = [...new Set(observedBarTimes.map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);
  const missing = [];
  for (let i = 1; i < times.length; i++) {
    for (let expected = times[i-1] + FOUR_HOURS_SECONDS; expected < times[i]; expected += FOUR_HOURS_SECONDS) missing.push(expected);
  }
  return { observedBars:times.length,gapCount:missing.length,missingBarTimes:missing };
}

export function runKnowledgeForwardSnapshot({ series,endIndex,dataSignature='unknown' } = {}) {
  try { assertKnowledgeForwardEpochRuntime(); }
  catch (error) { return { version:KNOWLEDGE_FORWARD_RUNNER_VERSION,status:'blocked',reason:error.message }; }
  if (!Array.isArray(series) || !series.length) return { version:KNOWLEDGE_FORWARD_RUNNER_VERSION,status:'unavailable',reason:'missing-series' };
  const sourceBefore = JSON.stringify(series);
  const safeEnd = Math.min(Number(endIndex ?? series.length - 1),series.length - 1);
  const eligibleIndexes = getKnowledgeForwardEligibleIndexes(series,safeEnd);
  const wave1Engine = new HumanKnowledgeEngine();
  const wave2Engine = new HumanPlaybookEngine();
  const championEngine = new ShadowEngine({ seriesProvider:() => series });
  const analyses = new Map();
  const championAnalyses = new Map();
  for (const idx of eligibleIndexes) {
    const wave1 = wave1Engine.analyze(series,idx);
    const wave2 = wave2Engine.analyze(series,idx);
    if (wave1.status !== 'complete' || wave2.status !== 'complete') continue;
    analyses.set(idx,{wave1,wave2});
    championAnalyses.set(idx,championEngine.analyze('BTCUSD',idx));
  }
  const sources = [
    { id:'champion-001',role:'benchmark' },
    ...KNOWLEDGE_CANDIDATE_REGISTRY.candidates.map(item => ({ id:item.id,role:'candidate' })),
  ];
  const allDecisions = [];
  const allEvidence = [];
  for (const source of sources) {
    const result = evaluateSourcePath({ sourceId:source.id,role:source.role,series,eligibleIndexes,analyses,championAnalyses,dataSignature });
    allDecisions.push(...result.decisions);
    allEvidence.push(...result.evidence);
  }
  const observedBarTimes = eligibleIndexes.map(idx => Number(series[idx]?.t)).filter(Number.isFinite);
  const continuity = detectKnowledgeForwardBarGaps(observedBarTimes);
  if (JSON.stringify(series) !== sourceBefore) return { version:KNOWLEDGE_FORWARD_RUNNER_VERSION,status:'blocked',reason:'source-series-mutated' };
  return {
    version:KNOWLEDGE_FORWARD_RUNNER_VERSION,
    status:'complete',
    epoch:KNOWLEDGE_FORWARD_EPOCH,
    dataSignature,
    endIndex:safeEnd,
    eligibleObservedBars:observedBarTimes.length,
    observedBarTimes,
    continuity,
    decisions:allDecisions,
    evidence:allEvidence,
    methodology:{
      prospectiveOnly:true,
      candleOpenTimestampStrictlyAfterFreeze:true,
      preFreezeBarsIndicatorContextOnly:true,
      preFreezePnlForbidden:true,
      fixedHorizonBars:KNOWLEDGE_FORWARD_EPOCH.horizonBars,
      independentNonOverlappingPathPerSource:true,
      matchedChampionBenchmark:true,
      deterministicEntryBarCost:true,
      costModelVersion:RESEARCH_COST_MODEL_VERSION,
      noFitting:true,
      optimizer:false,
      parameterSweep:false,
      selfLearning:false,
      adaptiveWeights:false,
      automaticSelection:false,
      automaticPromotion:false,
      promotionEligible:false,
      usedByLiveDecisionEngine:false,
      existingForward001Unchanged:true,
    },
  };
}
