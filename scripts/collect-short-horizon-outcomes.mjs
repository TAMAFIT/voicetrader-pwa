import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SHORT_HORIZON_CRYPTO_STREAMS,
  fetchKrakenOhlcStream,
} from '../src/short-horizon/kraken-ohlc.js';
import { fetchUsdJpyShortHorizon } from '../src/short-horizon/dukascopy-fx.js';
import {
  evaluateShortHorizonOutcome,
  validateShortHorizonOutcomeRecord,
} from '../src/short-horizon/outcome-contract.js';
import { readProspectiveSignalArchive } from './lib/short-horizon-signal-reader.mjs';
import {
  mergeOutcomesIntoArchive,
  readOutcomeArchiveRecords,
  writeOutcomeArchiveManifest,
} from './lib/short-horizon-outcome-archive.mjs';

export const SHORT_HORIZON_OUTCOME_COLLECTOR_VERSION = 'short-horizon-outcome-collector-v1';
const FX_LOOKBACK_HOURS = 72;
const HORIZON_KINDS = Object.freeze(['primary', 'secondary']);

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--signal-root') out.signalRoot = argv[++index];
    else if (argv[index] === '--outcome-root') out.outcomeRoot = argv[++index];
  }
  return out;
}

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};

const sha256 = (value) => crypto.createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(stable(value)),
).digest('hex');

function eventEconomicView(event) {
  return {
    schemaVersion:event.schemaVersion,
    eventType:event.eventType,
    assetClass:event.assetClass,
    instrument:event.instrument,
    venue:event.venue,
    timeframeMinutes:Number(event.timeframeMinutes),
    sourceTimestampMs:Number(event.sourceTimestampMs),
    open:Number(event.open),
    high:Number(event.high),
    low:Number(event.low),
    close:Number(event.close),
    volume:Number(event.volume || 0),
    trades:Number(event.trades || 0),
    sourceId:event.sourceId,
    dataQuality:event.dataQuality,
  };
}

function futureWindowSha256(events) {
  return sha256(events.map(eventEconomicView));
}

function signalSha256(signalRecord) {
  return sha256(signalRecord);
}

function streamKey({ instrument, timeframeMinutes }) {
  return `${instrument}-${Number(timeframeMinutes)}m`;
}

function outcomeIdFor(signalRecord, horizonKind) {
  const horizonMinutes = horizonKind === 'primary'
    ? Number(signalRecord.decision.intendedHorizonMinutes)
    : Number(signalRecord.decision.secondaryHorizonMinutes);
  return `${signalRecord.signalId}|${horizonKind}|${horizonMinutes}m`;
}

function providerResult(id, provider, status, extra = {}) {
  return { id, provider, status, ...extra };
}

async function fetchProviderWindows(nowMs, requiredKeys) {
  const windows = new Map();
  const providerHealth = [];

  for (const stream of SHORT_HORIZON_CRYPTO_STREAMS) {
    if (!requiredKeys.has(stream.id)) continue;
    try {
      const fetched = await fetchKrakenOhlcStream(stream, { nowMs });
      windows.set(stream.id, fetched.events);
      providerHealth.push(providerResult(stream.id, fetched.meta.providerVersion, 'SUCCESS', {
        eventCount:fetched.events.length,
        firstSourceTimestampMs:fetched.events[0]?.sourceTimestampMs ?? null,
        lastSourceTimestampMs:fetched.events.at(-1)?.sourceTimestampMs ?? null,
      }));
    } catch (error) {
      providerHealth.push(providerResult(stream.id, 'short-horizon-kraken-ohlc-v1', 'FAILED', {
        reason:error?.message || String(error),
      }));
    }
  }

  if ([...requiredKeys].some((key) => key.startsWith('USDJPY-'))) {
    try {
      const fetched = await fetchUsdJpyShortHorizon({
        fromMs:nowMs - FX_LOOKBACK_HOURS * 60 * 60_000,
        toMs:nowMs,
        nowMs,
        ignoreFlats:false,
      });
      for (const id of ['USDJPY-1m', 'USDJPY-5m']) {
        if (!requiredKeys.has(id)) continue;
        const events = fetched.streams[id] || [];
        windows.set(id, events);
        providerHealth.push(providerResult(id, fetched.providerVersion, 'SUCCESS', {
          eventCount:events.length,
          firstSourceTimestampMs:events[0]?.sourceTimestampMs ?? null,
          lastSourceTimestampMs:events.at(-1)?.sourceTimestampMs ?? null,
        }));
      }
    } catch (error) {
      for (const id of ['USDJPY-1m', 'USDJPY-5m']) {
        if (!requiredKeys.has(id)) continue;
        providerHealth.push(providerResult(id, 'short-horizon-dukascopy-fx-v1', 'FAILED', {
          reason:error?.message || String(error),
        }));
      }
    }
  }

  return { windows, providerHealth };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.signalRoot) throw new Error('short-horizon-outcome-signal-root-required');
  if (!args.outcomeRoot) throw new Error('short-horizon-outcome-root-required');
  const signalRoot = path.resolve(args.signalRoot);
  const outcomeRoot = path.resolve(args.outcomeRoot);
  const startedAtMs = Date.now();
  const nowMs = startedAtMs;

  const signalArchive = readProspectiveSignalArchive(signalRoot);
  const existingOutcomeArchive = readOutcomeArchiveRecords(outcomeRoot);
  const completedOutcomeIds = new Set(existingOutcomeArchive.records.map((record) => record.outcomeId));

  const work = [];
  for (const signalRecord of signalArchive.records) {
    for (const horizonKind of HORIZON_KINDS) {
      const outcomeId = outcomeIdFor(signalRecord, horizonKind);
      if (!completedOutcomeIds.has(outcomeId)) work.push({ signalRecord, horizonKind, outcomeId });
    }
  }

  const requiredKeys = new Set(work.map(({ signalRecord }) => streamKey(signalRecord.market)));
  const { windows, providerHealth } = await fetchProviderWindows(nowMs, requiredKeys);
  const maturedRecords = [];
  const evaluationHealth = [];
  let pendingTime = 0;
  let missingData = 0;
  let providerUnavailable = 0;
  let matured = 0;

  for (const item of work) {
    const key = streamKey(item.signalRecord.market);
    const events = windows.get(key);
    if (!events) {
      providerUnavailable += 1;
      evaluationHealth.push({
        outcomeId:item.outcomeId,
        signalId:item.signalRecord.signalId,
        streamId:key,
        horizonKind:item.horizonKind,
        status:'PROVIDER_UNAVAILABLE',
      });
      continue;
    }

    const result = evaluateShortHorizonOutcome({
      signalRecord:item.signalRecord,
      events,
      horizonKind:item.horizonKind,
      observedAtMs:nowMs,
      signalRecordSha256:signalSha256(item.signalRecord),
    });

    if (result.status === 'PENDING_TIME') {
      pendingTime += 1;
      evaluationHealth.push({
        outcomeId:item.outcomeId,
        signalId:item.signalRecord.signalId,
        streamId:key,
        horizonKind:item.horizonKind,
        horizonMinutes:result.horizonMinutes,
        status:result.status,
        targetCloseTimestampMs:result.targetCloseTimestampMs,
        remainingMs:result.remainingMs,
      });
      continue;
    }
    if (result.status === 'MISSING_DATA') {
      missingData += 1;
      evaluationHealth.push({
        outcomeId:item.outcomeId,
        signalId:item.signalRecord.signalId,
        streamId:key,
        horizonKind:item.horizonKind,
        horizonMinutes:result.horizonMinutes,
        status:result.status,
        targetCloseTimestampMs:result.targetCloseTimestampMs,
        missingSourceTimestampsMs:result.missingSourceTimestampsMs,
      });
      continue;
    }

    result.record.provenance.futureWindowSha256 = futureWindowSha256(result.futureEvents);
    validateShortHorizonOutcomeRecord(result.record);
    maturedRecords.push(result.record);
    matured += 1;
    evaluationHealth.push({
      outcomeId:item.outcomeId,
      signalId:item.signalRecord.signalId,
      streamId:key,
      horizonKind:item.horizonKind,
      horizonMinutes:result.horizonMinutes,
      status:'MATURED',
      targetCloseTimestampMs:result.targetCloseTimestampMs,
      rawOutcomeClass:result.record.result.rawOutcomeClass,
      rawDirectionalReturnPct:result.record.result.rawDirectionalReturnPct,
    });
  }

  const mergeSummary = mergeOutcomesIntoArchive({ rootDir:outcomeRoot, records:maturedRecords });
  const providerFailures = providerHealth.filter((item) => item.status === 'FAILED').length;
  const status = providerFailures > 0 || providerUnavailable > 0 || missingData > 0 ? 'warning' : 'success';
  const finishedAtMs = Date.now();
  const lastRun = {
    status,
    collectorVersion:SHORT_HORIZON_OUTCOME_COLLECTOR_VERSION,
    startedAtMs,
    finishedAtMs,
    durationMs:finishedAtMs - startedAtMs,
    cadenceMinutes:15,
    fxLookbackHours:FX_LOOKBACK_HOURS,
    githubRunId:process.env.GITHUB_RUN_ID || null,
    githubRunAttempt:process.env.GITHUB_RUN_ATTEMPT || null,
    aggregate:{
      signalsRead:signalArchive.records.length,
      existingOutcomes:existingOutcomeArchive.records.length,
      incompleteHorizonsAtStart:work.length,
      matured,
      pendingTime,
      missingData,
      providerUnavailable,
      providerFailures,
      archiveAdded:mergeSummary.added,
      archiveDuplicates:mergeSummary.duplicates,
      archiveFilesTouched:mergeSummary.filesTouched,
    },
    providerHealth,
    evaluations:evaluationHealth,
  };
  const manifest = writeOutcomeArchiveManifest({ rootDir:outcomeRoot, lastRun });

  console.log(JSON.stringify({
    collectorVersion:SHORT_HORIZON_OUTCOME_COLLECTOR_VERSION,
    status,
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
