import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  equivalentMarketEvent,
  marketEventKey,
  sortMarketEvents,
  validateMarketEvent,
} from '../../src/short-horizon/market-event.js';

export const SHORT_HORIZON_ARCHIVE_VERSION = 'short-horizon-archive-v1';

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive:true });
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

function utcDayParts(timestampMs) {
  const date = new Date(timestampMs);
  if (!Number.isFinite(date.getTime())) throw new Error('invalid-archive-timestamp');
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return { year, month, day, isoDay:`${year}-${month}-${day}` };
}

function assetClassDirectory(value) {
  const normalized = String(value || 'crypto').trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(normalized)) throw new Error('invalid-archive-asset-class');
  return normalized;
}

export function archiveRelativePath(event) {
  validateMarketEvent(event);
  const { year, month, isoDay } = utcDayParts(event.sourceTimestampMs);
  return path.posix.join(
    'data', 'short-horizon', assetClassDirectory(event.assetClass), event.instrument,
    `${event.timeframeMinutes}m`, year, month, `${isoDay}.ndjson`,
  );
}

function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return [];
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      const event = JSON.parse(line);
      validateMarketEvent(event);
      return event;
    } catch (error) {
      throw new Error(`invalid-archive-line:${filePath}:${index + 1}:${error?.message || error}`);
    }
  });
}

function writeNdjsonAtomic(filePath, events) {
  ensureDir(path.dirname(filePath));
  const sorted = sortMarketEvents(events);
  const body = `${sorted.map((event) => JSON.stringify(event)).join('\n')}\n`;
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, body, 'utf8');
  fs.renameSync(tempPath, filePath);
}

export function mergeEventsIntoArchive({ rootDir, events }) {
  if (!rootDir) throw new Error('archive-root-required');
  if (!Array.isArray(events)) throw new Error('archive-events-required');

  const grouped = new Map();
  for (const event of events) {
    validateMarketEvent(event);
    const relativePath = archiveRelativePath(event);
    if (!grouped.has(relativePath)) grouped.set(relativePath, []);
    grouped.get(relativePath).push(event);
  }

  const summary = { filesTouched:0, fetched:events.length, added:0, duplicates:0, conflicts:0 };
  for (const [relativePath, incoming] of grouped.entries()) {
    const filePath = path.join(rootDir, ...relativePath.split('/'));
    const existing = readNdjson(filePath);
    const byKey = new Map(existing.map((event) => [marketEventKey(event), event]));
    let changed = false;

    for (const event of incoming) {
      const key = marketEventKey(event);
      const current = byKey.get(key);
      if (!current) {
        byKey.set(key, event);
        summary.added += 1;
        changed = true;
        continue;
      }
      if (equivalentMarketEvent(current, event)) {
        summary.duplicates += 1;
        continue;
      }
      summary.conflicts += 1;
      throw new Error(`market-data-conflict:${key}`);
    }

    if (changed) {
      writeNdjsonAtomic(filePath, [...byKey.values()]);
      summary.filesTouched += 1;
    }
  }
  return summary;
}

function walkFiles(dir, predicate, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, predicate, output);
    else if (entry.isFile() && predicate(full)) output.push(full);
  }
  return output;
}

function streamDirectory(rootDir, stream) {
  return path.join(
    rootDir, 'data', 'short-horizon', assetClassDirectory(stream.assetClass || 'crypto'),
    stream.instrument, `${stream.timeframeMinutes}m`,
  );
}

export function inspectArchiveStream(rootDir, stream) {
  const files = walkFiles(streamDirectory(rootDir, stream), (file) => file.endsWith('.ndjson')).sort();
  const events = files.flatMap(readNdjson).sort((a, b) => a.sourceTimestampMs - b.sourceTimestampMs);
  const seen = new Set();
  let duplicateKeyCount = 0;
  let rawGapCount = 0;
  let continuousGapCount = 0;
  let continuousMissingBars = 0;
  let largestGapMinutes = 0;
  const intervalMs = stream.timeframeMinutes * 60_000;
  const continuityMode = stream.expectedContinuity || 'continuous-24x7';

  for (let i = 0; i < events.length; i += 1) {
    const key = marketEventKey(events[i]);
    if (seen.has(key)) duplicateKeyCount += 1;
    seen.add(key);
    if (i === 0) continue;
    const delta = events[i].sourceTimestampMs - events[i - 1].sourceTimestampMs;
    if (delta > intervalMs) {
      rawGapCount += 1;
      largestGapMinutes = Math.max(largestGapMinutes, delta / 60_000);
      if (continuityMode === 'continuous-24x7') {
        continuousGapCount += 1;
        continuousMissingBars += Math.max(0, Math.round(delta / intervalMs) - 1);
      }
    }
    if (delta <= 0) throw new Error(`non-monotonic-market-data:${stream.id}`);
  }

  const canonical = events.map((event) => JSON.stringify(event)).join('\n');
  return {
    id: stream.id,
    assetClass: stream.assetClass || 'crypto',
    instrument: stream.instrument,
    venue: stream.venue,
    timeframeMinutes: stream.timeframeMinutes,
    continuityMode,
    recordCount: events.length,
    fileCount: files.length,
    firstSourceTimestampMs: events[0]?.sourceTimestampMs ?? null,
    lastSourceTimestampMs: events.at(-1)?.sourceTimestampMs ?? null,
    gapCount: continuityMode === 'continuous-24x7' ? continuousGapCount : null,
    missingBars: continuityMode === 'continuous-24x7' ? continuousMissingBars : null,
    rawGapCount,
    largestGapMinutes,
    duplicateKeyCount,
    contentSha256: sha256(canonical),
  };
}

export function writeArchiveManifest({
  rootDir,
  streams,
  lastRun,
  manifestFile = 'manifest.json',
  source = null,
}) {
  if (!rootDir) throw new Error('archive-root-required');
  if (!/^[a-z0-9._-]+$/i.test(manifestFile)) throw new Error('invalid-manifest-file');
  const inspected = streams.map((stream) => inspectArchiveStream(rootDir, stream));
  const manifest = {
    schemaVersion: 'short-horizon-manifest-v1',
    archiveVersion: SHORT_HORIZON_ARCHIVE_VERSION,
    updatedAtMs: Date.now(),
    storage: {
      kind: 'github-generated-data-branch',
      branch: 'short-horizon-data',
      format: 'ndjson-daily-utc',
      futureLocalMigrationSupported: true,
    },
    source: source || {
      provider: 'Kraken public OHLC',
      closedCandlesOnly: true,
      sourceWindowLimitPerRequest: 720,
    },
    streams: inspected,
    lastRun,
    guardrails: {
      realMoneyRouting: false,
      orderSubmission: false,
      legacyResearchMutation: false,
      generatedDataOnly: true,
    },
  };
  const manifestDir = path.join(rootDir, 'data', 'short-horizon');
  ensureDir(manifestDir);
  fs.writeFileSync(path.join(manifestDir, manifestFile), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}
