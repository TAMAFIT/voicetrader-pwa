import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildShortHorizonCostBreakEvenRecord } from '../src/short-horizon/cost-break-even.js';
import {
  inspectCostAnalysisArchive,
  mergeCostAnalysesIntoArchive,
  writeCostAnalysisManifest,
} from './lib/short-horizon-cost-analysis-archive.mjs';

const BASE = Date.UTC(2026, 7, 20, 13, 0, 0);

function makeOutcome({
  suffix,
  signal,
  rawDirectionalReturnPct,
  rawOutcomeClass,
  targetOffsetMinutes = 5,
} = {}) {
  return {
    schemaVersion:'short-horizon-outcome-v1',
    outcomeId:`outcome-${suffix}`,
    signalId:`signal-${suffix}`,
    horizonKind:'primary',
    horizonMinutes:5,
    status:'MATURED',
    maturedAtMs:BASE + (targetOffsetMinutes + 1) * 60_000,
    targetCloseTimestampMs:BASE + targetOffsetMinutes * 60_000,
    signalDecisionBarCloseTimestampMs:BASE,
    market:{
      assetClass:'crypto', instrument:'BTCUSD', venue:'kraken', timeframeMinutes:1,
      entryPrice:100, exitPrice:100, exitSourceTimestampMs:BASE + (targetOffsetMinutes - 1) * 60_000,
      marketReturnPct:0, marketMaxUpPct:1, marketMaxDownPct:-1, pathBarCount:5,
    },
    decision:{
      signal, signalStrengthScore:60, primarySession:'LONDON_NEW_YORK_OVERLAP', regime:'TREND', riskGate:'OPEN',
    },
    result:{
      rawDirectionalReturnPct,
      rawOutcomeClass,
      mfePct:signal === 'WAIT' ? null : 1,
      maePct:signal === 'WAIT' ? null : -1,
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

const win = buildShortHorizonCostBreakEvenRecord(makeOutcome({
  suffix:'win', signal:'LONG', rawDirectionalReturnPct:0.15, rawOutcomeClass:'WIN',
}), { outcomeRecordSha256:'outcome-win-sha', analyzedAtMs:BASE + 10_000 });
assert.equal(win.gross.grossDirectionalReturnBps, 15);
assert.equal(win.costEnvelope.breakEvenRoundTripCostBps, 15);
assert.equal(win.costEnvelope.positiveCostBudgetExists, true);
assert.equal(win.costEnvelope.strictPositiveNetRequiresActualCostBelowBreakEven, true);
assert.equal(win.costEnvelope.actualRoundTripCostBps, null);
assert.equal(win.costEnvelope.netReturnAvailable, false);
assert.equal(win.costEnvelope.providerCostClaim, false);
assert.equal(win.provenance.outcomeRecordSha256, 'outcome-win-sha');

const loss = buildShortHorizonCostBreakEvenRecord(makeOutcome({
  suffix:'loss', signal:'SHORT', rawDirectionalReturnPct:-0.10, rawOutcomeClass:'LOSS',
}), { analyzedAtMs:BASE + 20_000 });
assert.equal(loss.gross.grossDirectionalReturnBps, -10);
assert.equal(loss.costEnvelope.breakEvenRoundTripCostBps, 0);
assert.equal(loss.costEnvelope.positiveCostBudgetExists, false);

const flat = buildShortHorizonCostBreakEvenRecord(makeOutcome({
  suffix:'flat', signal:'LONG', rawDirectionalReturnPct:0, rawOutcomeClass:'FLAT',
}), { analyzedAtMs:BASE + 30_000 });
assert.equal(flat.gross.grossDirectionalReturnBps, 0);
assert.equal(flat.costEnvelope.breakEvenRoundTripCostBps, 0);
assert.equal(flat.costEnvelope.positiveCostBudgetExists, false);

const wait = buildShortHorizonCostBreakEvenRecord(makeOutcome({
  suffix:'wait', signal:'WAIT', rawDirectionalReturnPct:null, rawOutcomeClass:'WAIT_OBSERVATION',
}), { analyzedAtMs:BASE + 40_000 });
assert.equal(wait.gross.directionalTrade, false);
assert.equal(wait.gross.grossDirectionalReturnBps, null);
assert.equal(wait.costEnvelope.breakEvenRoundTripCostBps, null);
assert.equal(wait.costEnvelope.positiveCostBudgetExists, false);
assert.equal(wait.costEnvelope.netReturnAvailable, false);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'voicetrader-cost-analysis-'));
try {
  const first = mergeCostAnalysesIntoArchive({ rootDir:root, records:[win, loss, flat, wait] });
  assert.equal(first.added, 4);
  assert.equal(first.duplicates, 0);

  const retry = JSON.parse(JSON.stringify(win));
  retry.analyzedAtMs += 9999;
  const duplicate = mergeCostAnalysesIntoArchive({ rootDir:root, records:[retry] });
  assert.equal(duplicate.added, 0);
  assert.equal(duplicate.duplicates, 1);

  const conflict = JSON.parse(JSON.stringify(win));
  conflict.costEnvelope.breakEvenRoundTripCostBps = 999;
  assert.throws(() => mergeCostAnalysesIntoArchive({ rootDir:root, records:[conflict] }), /immutability-conflict/);

  const inspected = inspectCostAnalysisArchive(root);
  assert.equal(inspected.recordCount, 4);
  assert.equal(inspected.duplicateAnalysisIdCount, 0);
  assert.equal(inspected.groups.length, 1);
  const group = inspected.groups[0];
  assert.equal(group.directionalCount, 3);
  assert.equal(group.waitCount, 1);
  assert.equal(group.directionalOutcomeCounts.WIN, 1);
  assert.equal(group.directionalOutcomeCounts.LOSS, 1);
  assert.equal(group.directionalOutcomeCounts.FLAT, 1);
  assert.equal(group.breakEvenEvidence.positiveCostBudgetCount, 1);
  assert.equal(group.breakEvenEvidence.positiveCostBudgetRate, 0.333333);
  assert.equal(group.breakEvenEvidence.meanGrossDirectionalReturnBps, 1.666667);
  assert.equal(group.breakEvenEvidence.medianGrossDirectionalReturnBps, 0);
  assert.equal(group.breakEvenEvidence.meanBreakEvenRoundTripCostBps, 5);
  assert.equal(group.breakEvenEvidence.p25BreakEvenRoundTripCostBps, 0);
  assert.equal(group.breakEvenEvidence.medianBreakEvenRoundTripCostBps, 0);
  assert.equal(group.breakEvenEvidence.p75BreakEvenRoundTripCostBps, 7.5);
  assert.equal(group.breakEvenEvidence.maximumObservedBreakEvenRoundTripCostBps, 15);
  assert.equal(group.costBinding.status, 'UNBOUND');
  assert.equal(group.costBinding.actualRoundTripCostBps, null);
  assert.equal(group.costBinding.netReturnAvailable, false);

  const manifest = writeCostAnalysisManifest({
    rootDir:root,
    lastRun:{ status:'success', aggregate:{ outcomesRead:4, newAnalyses:4 } },
  });
  assert.equal(manifest.storage.branch, 'short-horizon-cost-analysis-data');
  assert.equal(manifest.storage.sourceOutcomesBranch, 'short-horizon-outcome-data');
  assert.equal(manifest.methodology.optimizer, false);
  assert.equal(manifest.methodology.providerCostBinding, false);
  assert.equal(manifest.methodology.arbitraryCostScenarioGrid, false);
  assert.equal(manifest.methodology.changesHumanCanonThresholds, false);
  assert.equal(manifest.methodology.netReturnAvailable, false);
  assert.equal(manifest.guardrails.executionAuthorized, false);
  assert.equal(manifest.guardrails.realMoneyRouting, false);
  assert.equal(manifest.guardrails.orderSubmission, false);
} finally {
  fs.rmSync(root, { recursive:true, force:true });
}

console.log('short-horizon cost break-even analysis tests passed');
