import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OANDA_JAPAN_NY_PRO_REST_V1 } from '../src/short-horizon/deployability-registry.js';
import { buildShortHorizonReferenceCostAssessment } from '../src/short-horizon/reference-cost-binding.js';
import { readOutcomeArchiveRecords } from './lib/short-horizon-outcome-archive.mjs';
import { readCostAnalysisRecords } from './lib/short-horizon-cost-analysis-archive.mjs';
import {
  mergeDeployabilityAssessmentsIntoArchive,
  readDeployabilityAssessments,
  writeDeployabilityManifest,
} from './lib/short-horizon-deployability-archive.mjs';

export const SHORT_HORIZON_DEPLOYABILITY_COLLECTOR_VERSION = 'short-horizon-deployability-collector-v1';

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--outcome-root') out.outcomeRoot = argv[++index];
    else if (argv[index] === '--cost-root') out.costRoot = argv[++index];
    else if (argv[index] === '--deployability-root') out.deployabilityRoot = argv[++index];
  }
  return out;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.outcomeRoot) throw new Error('short-horizon-deployability-outcome-root-required');
  if (!args.costRoot) throw new Error('short-horizon-deployability-cost-root-required');
  if (!args.deployabilityRoot) throw new Error('short-horizon-deployability-root-required');

  const outcomeRoot = path.resolve(args.outcomeRoot);
  const costRoot = path.resolve(args.costRoot);
  const deployabilityRoot = path.resolve(args.deployabilityRoot);
  const startedAtMs = Date.now();

  const outcomes = readOutcomeArchiveRecords(outcomeRoot);
  const costAnalyses = readCostAnalysisRecords(costRoot);
  const existing = readDeployabilityAssessments(deployabilityRoot);
  const outcomeById = new Map(outcomes.records.map((record) => [record.outcomeId, record]));
  if (outcomeById.size !== outcomes.records.length) throw new Error('short-horizon-deployability-outcome-map-duplicate');
  const existingIds = new Set(existing.records.map((record) => record.assessmentId));

  const eligibleCostAnalyses = costAnalyses.records.filter((record) =>
    record.market.assetClass === 'fx' && record.market.instrument === 'USDJPY'
  );
  const records = [];
  for (const costAnalysisRecord of eligibleCostAnalyses) {
    const assessmentId = `${costAnalysisRecord.analysisId}|${OANDA_JAPAN_NY_PRO_REST_V1.providerId}|published-reference-v1`;
    if (existingIds.has(assessmentId)) continue;
    const outcomeRecord = outcomeById.get(costAnalysisRecord.outcomeId);
    if (!outcomeRecord) throw new Error(`short-horizon-deployability-source-outcome-missing:${costAnalysisRecord.outcomeId}`);
    records.push(buildShortHorizonReferenceCostAssessment({
      costAnalysisRecord,
      outcomeRecord,
      providerProfile:OANDA_JAPAN_NY_PRO_REST_V1,
      assessedAtMs:startedAtMs,
      costAnalysisRecordSha256:sha256(costAnalysisRecord),
      outcomeRecordSha256:sha256(outcomeRecord),
    }));
  }

  const mergeSummary = mergeDeployabilityAssessmentsIntoArchive({ rootDir:deployabilityRoot, records });
  const finishedAtMs = Date.now();
  const lastRun = {
    status:'success',
    collectorVersion:SHORT_HORIZON_DEPLOYABILITY_COLLECTOR_VERSION,
    startedAtMs,
    finishedAtMs,
    durationMs:finishedAtMs - startedAtMs,
    cadenceMinutes:60,
    githubRunId:process.env.GITHUB_RUN_ID || null,
    githubRunAttempt:process.env.GITHUB_RUN_ATTEMPT || null,
    aggregate:{
      outcomesRead:outcomes.records.length,
      costAnalysesRead:costAnalyses.records.length,
      eligibleUsdJpyCostAnalyses:eligibleCostAnalyses.length,
      excludedNonUsdJpyCostAnalyses:costAnalyses.records.length - eligibleCostAnalyses.length,
      existingAssessments:existing.records.length,
      newAssessments:records.length,
      newDirectionalAssessments:records.filter((record) => record.breakEvenComparison.directionalTrade).length,
      newWaitAssessments:records.filter((record) => !record.breakEvenComparison.directionalTrade).length,
      archiveAdded:mergeSummary.added,
      archiveDuplicates:mergeSummary.duplicates,
      archiveFilesTouched:mergeSummary.filesTouched,
    },
  };
  const manifest = writeDeployabilityManifest({
    rootDir:deployabilityRoot,
    lastRun,
    providerProfile:OANDA_JAPAN_NY_PRO_REST_V1,
  });

  console.log(JSON.stringify({
    collectorVersion:SHORT_HORIZON_DEPLOYABILITY_COLLECTOR_VERSION,
    status:'success',
    archiveRecordCount:manifest.archive.recordCount,
    mergeSummary,
    aggregate:lastRun.aggregate,
    readinessStatus:'REFERENCE_READY_OPERATOR_ELIGIBILITY_UNVERIFIED',
  }, null, 2));
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
