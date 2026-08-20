import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  OANDA_JAPAN_NY_PRO_REST_V1,
  validateShortHorizonDeployabilityProvider,
} from '../src/short-horizon/deployability-registry.js';
import { buildShortHorizonCostBreakEvenRecord } from '../src/short-horizon/cost-break-even.js';
import { buildShortHorizonReferenceCostAssessment } from '../src/short-horizon/reference-cost-binding.js';
import {
  inspectDeployabilityArchive,
  mergeDeployabilityAssessmentsIntoArchive,
  writeDeployabilityManifest,
} from './lib/short-horizon-deployability-archive.mjs';

const BASE = Date.UTC(2026, 7, 20, 13, 0, 0);

function makeOutcome({ suffix, signal = 'LONG', rawDirectionalReturnPct = 0.01, rawOutcomeClass = 'WIN' } = {}) {
  return {
    schemaVersion:'short-horizon-outcome-v1',
    outcomeId:`outcome-${suffix}`,
    signalId:`signal-${suffix}`,
    horizonKind:'primary',
    horizonMinutes:5,
    status:'MATURED',
    maturedAtMs:BASE + 6 * 60_000,
    targetCloseTimestampMs:BASE + 5 * 60_000,
    signalDecisionBarCloseTimestampMs:BASE,
    market:{
      assetClass:'fx', instrument:'USDJPY', venue:'dukascopy', timeframeMinutes:1,
      entryPrice:158.6, exitPrice:158.61586, exitSourceTimestampMs:BASE + 4 * 60_000,
      marketReturnPct:0.01, marketMaxUpPct:0.02, marketMaxDownPct:-0.01, pathBarCount:5,
    },
    decision:{
      signal, signalStrengthScore:60, primarySession:'LONDON_NEW_YORK_OVERLAP', regime:'TREND', riskGate:'OPEN',
    },
    result:{
      rawDirectionalReturnPct:signal === 'WAIT' ? null : rawDirectionalReturnPct,
      rawOutcomeClass:signal === 'WAIT' ? 'WAIT_OBSERVATION' : rawOutcomeClass,
      mfePct:signal === 'WAIT' ? null : 0.02,
      maePct:signal === 'WAIT' ? null : -0.01,
      transactionCostsModeled:false,
      netReturnPct:null,
      executionFillModeled:false,
    },
    provenance:{ evaluatorVersion:'short-horizon-outcome-evaluator-v1', exactAlignedClosedBars:true },
    governance:{
      mutatesSignalRecord:false, usedByDecisionEngine:false, futureOutcomeUsedForSignal:false,
      automaticPromotion:false, executionAuthorized:false, realMoneyRouting:false,
      orderSubmission:false, profitabilityClaim:false,
    },
  };
}

assert.equal(validateShortHorizonDeployabilityProvider(OANDA_JAPAN_NY_PRO_REST_V1), true);
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.provider.country, 'JP');
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.product.providerInstrument, 'USD_JPY');
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.product.publishedSpread.priceUnits, 0.008);
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.api.providerOrderSubmissionSupported, true);
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.eligibility.operatorEligibilityStatus, 'UNVERIFIED');
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.governance.executionAuthorized, false);

const winOutcome = makeOutcome({ suffix:'win' });
const winCost = buildShortHorizonCostBreakEvenRecord(winOutcome, { analyzedAtMs:BASE + 7 * 60_000 });
assert.equal(winCost.gross.grossDirectionalReturnBps, 1);
const winAssessment = buildShortHorizonReferenceCostAssessment({
  costAnalysisRecord:winCost,
  outcomeRecord:winOutcome,
  assessedAtMs:BASE + 8 * 60_000,
  costAnalysisRecordSha256:'cost-win-sha',
  outcomeRecordSha256:'outcome-win-sha',
});
assert.equal(winAssessment.publishedReferenceCost.bindingStatus, 'PUBLISHED_REFERENCE_ONLY');
assert.equal(winAssessment.publishedReferenceCost.publishedReferenceSpreadCostBps, 0.504414);
assert.equal(winAssessment.breakEvenComparison.breakEvenRoundTripCostBps, 1);
assert.equal(winAssessment.breakEvenComparison.publishedSpreadOnlyWithinBreakEven, true);
assert.equal(winAssessment.breakEvenComparison.marginToBreakEvenAfterPublishedSpreadBps, 0.495586);
assert.equal(winAssessment.market.sourceMarketMatchesExecutionVenue, false);
assert.equal(winAssessment.publishedReferenceCost.actualRoundTripCostBps, null);
assert.equal(winAssessment.publishedReferenceCost.netReturnAvailable, false);
assert.equal(winAssessment.deployability.operatorAccountEligibility, 'UNVERIFIED');
assert.equal(winAssessment.governance.orderSubmission, false);

const waitOutcome = makeOutcome({ suffix:'wait', signal:'WAIT' });
const waitCost = buildShortHorizonCostBreakEvenRecord(waitOutcome, { analyzedAtMs:BASE + 9 * 60_000 });
const waitAssessment = buildShortHorizonReferenceCostAssessment({
  costAnalysisRecord:waitCost,
  outcomeRecord:waitOutcome,
  assessedAtMs:BASE + 10 * 60_000,
});
assert.equal(waitAssessment.breakEvenComparison.directionalTrade, false);
assert.equal(waitAssessment.breakEvenComparison.breakEvenRoundTripCostBps, null);
assert.equal(waitAssessment.breakEvenComparison.publishedSpreadOnlyWithinBreakEven, null);
assert.equal(waitAssessment.breakEvenComparison.marginToBreakEvenAfterPublishedSpreadBps, null);
assert.equal(waitAssessment.publishedReferenceCost.publishedReferenceSpreadCostBps, 0.504414);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'voicetrader-deployability-'));
try {
  const first = mergeDeployabilityAssessmentsIntoArchive({ rootDir:root, records:[winAssessment, waitAssessment] });
  assert.equal(first.added, 2);
  assert.equal(first.duplicates, 0);

  const retry = JSON.parse(JSON.stringify(winAssessment));
  retry.assessedAtMs += 999;
  const duplicate = mergeDeployabilityAssessmentsIntoArchive({ rootDir:root, records:[retry] });
  assert.equal(duplicate.added, 0);
  assert.equal(duplicate.duplicates, 1);

  const conflict = JSON.parse(JSON.stringify(winAssessment));
  conflict.provenance.costAnalysisRecordSha256 = 'different-valid-cost-hash';
  assert.throws(() => mergeDeployabilityAssessmentsIntoArchive({ rootDir:root, records:[conflict] }), /immutability-conflict/);

  const inspected = inspectDeployabilityArchive(root);
  assert.equal(inspected.recordCount, 2);
  assert.equal(inspected.duplicateAssessmentIdCount, 0);
  assert.equal(inspected.groups.length, 1);
  const group = inspected.groups[0];
  assert.equal(group.directionalCount, 1);
  assert.equal(group.waitCount, 1);
  assert.equal(group.publishedReferenceEvidence.meanPublishedReferenceSpreadCostBps, 0.504414);
  assert.equal(group.publishedReferenceEvidence.directionalPublishedSpreadWithinBreakEvenCount, 1);
  assert.equal(group.publishedReferenceEvidence.directionalPublishedSpreadWithinBreakEvenRate, 1);
  assert.equal(group.publishedReferenceEvidence.meanDirectionalMarginToBreakEvenAfterPublishedSpreadBps, 0.495586);
  assert.equal(group.publishedReferenceEvidence.actualProviderCostBinding, false);
  assert.equal(group.publishedReferenceEvidence.actualNetEvAvailable, false);

  const manifest = writeDeployabilityManifest({
    rootDir:root,
    lastRun:{ status:'success', aggregate:{ newAssessments:2 } },
    providerProfile:OANDA_JAPAN_NY_PRO_REST_V1,
  });
  assert.equal(manifest.storage.branch, 'short-horizon-deployability-data');
  assert.equal(manifest.scope.instrument, 'USDJPY');
  assert.equal(manifest.scope.cryptoProvidersEvaluated, false);
  assert.equal(manifest.providerReference.eligibilityStatus, 'UNVERIFIED');
  assert.equal(manifest.providerReference.requiredNyServerBalanceJpy, 250000);
  assert.equal(manifest.methodology.actualProviderCostBinding, false);
  assert.equal(manifest.methodology.netReturnAvailable, false);
  assert.equal(manifest.guardrails.credentialsPresent, false);
  assert.equal(manifest.guardrails.executionAuthorized, false);
  assert.equal(manifest.guardrails.orderSubmission, false);
} finally {
  fs.rmSync(root, { recursive:true, force:true });
}

console.log('short-horizon OANDA Japan reference deployability tests passed');
