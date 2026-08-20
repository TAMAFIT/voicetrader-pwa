import path from 'node:path';
import process from 'node:process';
import {
  fetchKrakenOhlcStream,
  SHORT_HORIZON_CRYPTO_STREAMS,
  SHORT_HORIZON_KRAKEN_PROVIDER_VERSION,
} from '../src/short-horizon/kraken-ohlc.js';
import {
  mergeEventsIntoArchive,
  writeArchiveManifest,
} from './lib/short-horizon-archive.mjs';

const COLLECTOR_VERSION = 'short-horizon-crypto-collector-v1';

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const rootDir = path.resolve(readArg('--archive-root', '.'));
const startedAtMs = Date.now();
const aggregate = {
  fetched: 0,
  added: 0,
  duplicates: 0,
  conflicts: 0,
  filesTouched: 0,
};
const streamRuns = [];

for (const stream of SHORT_HORIZON_CRYPTO_STREAMS) {
  const snapshot = await fetchKrakenOhlcStream(stream);
  const merged = mergeEventsIntoArchive({ rootDir, events:snapshot.events });
  for (const key of Object.keys(aggregate)) aggregate[key] += Number(merged[key] || 0);
  streamRuns.push({
    id: stream.id,
    fetched: snapshot.events.length,
    firstSourceTimestampMs: snapshot.events[0]?.sourceTimestampMs ?? null,
    lastSourceTimestampMs: snapshot.events.at(-1)?.sourceTimestampMs ?? null,
    added: merged.added,
    duplicates: merged.duplicates,
    filesTouched: merged.filesTouched,
  });
}

const finishedAtMs = Date.now();
const lastRun = {
  status: 'success',
  collectorVersion: COLLECTOR_VERSION,
  providerVersion: SHORT_HORIZON_KRAKEN_PROVIDER_VERSION,
  startedAtMs,
  finishedAtMs,
  durationMs: finishedAtMs - startedAtMs,
  githubRunId: process.env.GITHUB_RUN_ID || null,
  githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  aggregate,
  streams: streamRuns,
};

const manifest = writeArchiveManifest({
  rootDir,
  streams: SHORT_HORIZON_CRYPTO_STREAMS,
  lastRun,
});

console.log(JSON.stringify({
  status: 'success',
  collectorVersion: COLLECTOR_VERSION,
  archiveRoot: rootDir,
  aggregate,
  streams: manifest.streams,
}, null, 2));
