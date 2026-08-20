import path from 'node:path';
import process from 'node:process';
import {
  fetchUsdJpyShortHorizon,
  SHORT_HORIZON_DUKASCOPY_PROVIDER_VERSION,
  SHORT_HORIZON_FX_STREAMS,
} from '../src/short-horizon/dukascopy-fx.js';
import {
  mergeEventsIntoArchive,
  writeArchiveManifest,
} from './lib/short-horizon-archive.mjs';

const COLLECTOR_VERSION = 'short-horizon-fx-collector-v1';
const LOOKBACK_MS = 72 * 60 * 60 * 1000;

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const rootDir = path.resolve(readArg('--archive-root', '.'));
const startedAtMs = Date.now();
const fromMs = startedAtMs - LOOKBACK_MS;
const snapshot = await fetchUsdJpyShortHorizon({ fromMs, toMs:startedAtMs, nowMs:startedAtMs });

const aggregate = {
  fetched: 0,
  added: 0,
  duplicates: 0,
  conflicts: 0,
  filesTouched: 0,
};
const streamRuns = [];

for (const stream of SHORT_HORIZON_FX_STREAMS) {
  const events = snapshot.streams[stream.id] || [];
  const merged = mergeEventsIntoArchive({ rootDir, events });
  for (const key of Object.keys(aggregate)) aggregate[key] += Number(merged[key] || 0);
  streamRuns.push({
    id:stream.id,
    fetched:events.length,
    firstSourceTimestampMs:events[0]?.sourceTimestampMs ?? null,
    lastSourceTimestampMs:events.at(-1)?.sourceTimestampMs ?? null,
    added:merged.added,
    duplicates:merged.duplicates,
    filesTouched:merged.filesTouched,
  });
}

const finishedAtMs = Date.now();
const lastRun = {
  status:'success',
  collectorVersion:COLLECTOR_VERSION,
  providerVersion:SHORT_HORIZON_DUKASCOPY_PROVIDER_VERSION,
  startedAtMs,
  finishedAtMs,
  durationMs:finishedAtMs - startedAtMs,
  lookbackHours:LOOKBACK_MS / 3_600_000,
  githubRunId:process.env.GITHUB_RUN_ID || null,
  githubRunAttempt:process.env.GITHUB_RUN_ATTEMPT || null,
  aggregate,
  streams:streamRuns,
};

const manifest = writeArchiveManifest({
  rootDir,
  streams:SHORT_HORIZON_FX_STREAMS,
  lastRun,
  manifestFile:'fx-manifest.json',
  source:{
    ...snapshot.source,
    packageVersion:snapshot.packageVersion,
    collectionMode:'hourly-72h-overlap-catchup',
    continuityAssessment:'session-aware-not-24x7',
  },
});

console.log(JSON.stringify({
  status:'success',
  collectorVersion:COLLECTOR_VERSION,
  archiveRoot:rootDir,
  aggregate,
  streams:manifest.streams,
}, null, 2));
