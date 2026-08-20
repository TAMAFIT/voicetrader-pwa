import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildShortHorizonCostBreakEvenRecord } from '../src/short-horizon/cost-break-even.js';
import { readOutcomeArchiveRecords } from './lib/short-horizon-outcome-archive.mjs';
import {
  mergeCostAnalysesIntoArchive,
  readCostAnalysisRecords,
  writeCostAnalysisManifest,
} from './lib/short-horizon-cost-analysis-archive.mjs';

export const SHORT_HORIZON_COST_ANALYSIS_COLLECTOR_VERSION = 'short-horizon-cost-analysis-collector-v1';

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--outcome-root') out.outcomeRoot = argv[++index];
    else if (argv[index] === '--analysis-root') out.analysisRoot = argv[++index];
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
  if (!args.outcomeRoot) throw new Error('short-horizon-cost-analysis-outcome-root-required');
  if (!args.analysisRoot) throw new Error('short-horizon-cost-analysis-root-required');
  const outcomeRoot = path.resolve(args.outcomeRoot);
  const analysisRoot = path.resolve(args.analysisRoot);
  const startedAtMs = Date.now();

  const outcomeArchive = readOutcomeArchiveRecords(outcomeRoot);
  const existingAnalysis = readCostAnalysisRecords(analysisRoot);
  const existingIds = new Set(existingAnalysis.records.map((record) => record.analysisId));
  const records = [];

  for (const outcomeRecord of outcomeArchive.records) {
    const analysisId = `${outcomeRecord.outcomeId}|cost-break-even-v1`;
    if (existingIds.has(analysisId)) continue;
    records.push(buildShortHorizonCostBreakEvenRecord(outcomeRecord, {
      outcomeRecordSha256:sha256(outcomeRecord),
      analyzedAtMs:startedAtMs,
    }));
  }

  const mergeSummary = mergeCostAnalysesIntoArchive({ rootDir:analysisRoot, records });
  const finishedAtMs = Date.now();
  const lastRun = {
    status:'success',
    collectorVersion:SHORT_HORIZON_COST_ANALYSIS_COLLECTOR_VERSION,
    startedAtMs,
    finishedAtMs,
    durationMs:finishedAtMs - startedAtMs,
    cadenceMinutes:15,
    githubRunId:process.env.GITHUB_RUN_ID || null,
    githubRunAttempt:process.env.GITHUB_RUN_ATTEMPT || null,
    aggregate:{
      outcomesRead:outcomeArchive.records.length,
      existingAnalyses:existingAnalysis.records.length,
      newAnalyses:records.length,
      newDirectionalAnalyses:records.filter((record) => record.gross.directionalTrade).length,
      newWaitAnalyses:records.filter((record) => !record.gross.directionalTrade).length,
      positiveCostBudgetNew:records.filter((record) => record.costEnvelope.positiveCostBudgetExists).length,
      archiveAdded:mergeSummary.added,
      archiveDuplicates:mergeSummary.duplicates,
      archiveFilesTouched:mergeSummary.filesTouched,
    },
  };
  const manifest = writeCostAnalysisManifest({ rootDir:analysisRoot, lastRun });
  console.log(JSON.stringify({
    collectorVersion:SHORT_HORIZON_COST_ANALYSIS_COLLECTOR_VERSION,
    status:'success',
    mergeSummary,
    archiveRecordCount:manifest.archive.recordCount,
    aggregate:lastRun.aggregate,
  }, null, 2));
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
