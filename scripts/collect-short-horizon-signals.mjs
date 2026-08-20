import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SHORT_HORIZON_CRYPTO_STREAMS,
  fetchKrakenOhlcStream,
} from '../src/short-horizon/kraken-ohlc.js';
import { fetchUsdJpyShortHorizon } from '../src/short-horizon/dukascopy-fx.js';
import {
  SHORT_HORIZON_PROSPECTIVE_ANALYSIS_WINDOW_BARS,
  buildProspectiveShortHorizonSignal,
  selectProspectiveAnalysisWindow,
} from '../src/short-horizon/prospective-signal-runner.js';
import {
  mergeSignalsIntoArchive,
  writeSignalArchiveManifest,
} from './lib/short-horizon-signal-archive.mjs';

export const SHORT_HORIZON_SIGNAL_COLLECTOR_VERSION = 'short-horizon-prospective-signal-collector-v1';
const FX_LOOKBACK_HOURS = 72;

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--archive-root') out.archiveRoot = argv[++index];
  }
  return out;
}

function canonicalDecisionInput(event) {
  return {
    schemaVersion:event.schemaVersion,
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
    closed:event.closed,
    dataQuality:event.dataQuality,
  };
}

function analysisWindowSha256(events) {
  const window = selectProspectiveAnalysisWindow(events, SHORT_HORIZON_PROSPECTIVE_ANALYSIS_WINDOW_BARS);
  if (window.length < SHORT_HORIZON_PROSPECTIVE_ANALYSIS_WINDOW_BARS) return null;
  const body = window.map((event) => JSON.stringify(canonicalDecisionInput(event))).join('\n');
  return crypto.createHash('sha256').update(body).digest('hex');
}

function streamSummary(id, provider, events, result) {
  const latest = Array.isArray(events) && events.length
    ? [...events].sort((a, b) => Number(a.sourceTimestampMs) - Number(b.sourceTimestampMs)).at(-1)
    : null;
  return {
    id,
    provider,
    status:result.status,
    reason:result.reason || null,
    fetchedEventCount:Array.isArray(events) ? events.length : 0,
    latestSourceTimestampMs:latest ? Number(latest.sourceTimestampMs) : null,
    latestClose:latest ? Number(latest.close) : null,
    freshness:result.freshness || null,
    signal:result.record?.decision?.signal || null,
    signalId:result.record?.signalId || null,
    intendedHorizonMinutes:result.record?.decision?.intendedHorizonMinutes || null,
    primarySession:result.record?.timeContext?.sessions?.primarySession || null,
  };
}

function failedSummary(id, provider, error) {
  return {
    id,
    provider,
    status:'FAILED',
    reason:error?.message || String(error),
    fetchedEventCount:0,
    latestSourceTimestampMs:null,
    latestClose:null,
    freshness:null,
    signal:null,
    signalId:null,
    intendedHorizonMinutes:null,
    primarySession:null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.archiveRoot) throw new Error('short-horizon-signal-archive-root-required');
  const archiveRoot = path.resolve(args.archiveRoot);
  const startedAtMs = Date.now();
  const nowMs = startedAtMs;
  const records = [];
  const streamResults = [];

  for (const stream of SHORT_HORIZON_CRYPTO_STREAMS) {
    try {
      const fetched = await fetchKrakenOhlcStream(stream, { nowMs });
      const inputWindowSha256 = analysisWindowSha256(fetched.events);
      const result = buildProspectiveShortHorizonSignal(fetched.events, {
        nowMs,
        inputWindowSha256,
        providerFetchMode:'kraken-public-ohlc-direct-v1',
      });
      if (result.record) records.push(result.record);
      streamResults.push(streamSummary(stream.id, fetched.meta.providerVersion, fetched.events, result));
    } catch (error) {
      streamResults.push(failedSummary(stream.id, 'short-horizon-kraken-ohlc-v1', error));
    }
  }

  try {
    const fx = await fetchUsdJpyShortHorizon({
      fromMs:nowMs - FX_LOOKBACK_HOURS * 60 * 60_000,
      toMs:nowMs,
      nowMs,
      ignoreFlats:false,
    });
    for (const id of ['USDJPY-1m', 'USDJPY-5m']) {
      const events = fx.streams[id] || [];
      try {
        const inputWindowSha256 = analysisWindowSha256(events);
        const result = buildProspectiveShortHorizonSignal(events, {
          nowMs,
          inputWindowSha256,
          providerFetchMode:'dukascopy-public-datafeed-direct-v1',
        });
        if (result.record) records.push(result.record);
        streamResults.push(streamSummary(id, fx.providerVersion, events, result));
      } catch (error) {
        streamResults.push(failedSummary(id, fx.providerVersion, error));
      }
    }
  } catch (error) {
    streamResults.push(failedSummary('USDJPY-1m', 'short-horizon-dukascopy-fx-v1', error));
    streamResults.push(failedSummary('USDJPY-5m', 'short-horizon-dukascopy-fx-v1', error));
  }

  const mergeSummary = mergeSignalsIntoArchive({
    rootDir:archiveRoot,
    records,
    updatedAtMs:nowMs,
  });
  const failed = streamResults.filter((item) => item.status === 'FAILED').length;
  const skipped = streamResults.filter((item) => item.status === 'SKIPPED').length;
  const recorded = streamResults.filter((item) => item.status === 'RECORDED').length;
  const status = failed === streamResults.length ? 'fail' : failed > 0 ? 'warning' : 'success';
  const finishedAtMs = Date.now();

  const lastRun = {
    status,
    collectorVersion:SHORT_HORIZON_SIGNAL_COLLECTOR_VERSION,
    startedAtMs,
    finishedAtMs,
    durationMs:finishedAtMs - startedAtMs,
    cadenceMinutes:15,
    fixedAnalysisWindowBars:SHORT_HORIZON_PROSPECTIVE_ANALYSIS_WINDOW_BARS,
    fxLookbackHours:FX_LOOKBACK_HOURS,
    githubRunId:process.env.GITHUB_RUN_ID || null,
    githubRunAttempt:process.env.GITHUB_RUN_ATTEMPT || null,
    aggregate:{
      streams:streamResults.length,
      recorded,
      skipped,
      failed,
      archiveAdded:mergeSummary.added,
      archiveDuplicates:mergeSummary.duplicates,
      archiveFilesTouched:mergeSummary.filesTouched,
    },
    streams:streamResults,
  };

  const manifest = writeSignalArchiveManifest({ rootDir:archiveRoot, lastRun });
  console.log(JSON.stringify({
    collectorVersion:SHORT_HORIZON_SIGNAL_COLLECTOR_VERSION,
    status,
    recordsProduced:records.length,
    mergeSummary,
    archiveRecordCount:manifest.archive.recordCount,
    streamResults,
  }, null, 2));
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
