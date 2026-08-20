import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  emptyShortHorizonSignalLedger,
  mergeProspectiveShortHorizonSignals,
} from '../../src/short-horizon/prospective-signal-ledger.js';
import { validateShortHorizonSignalRecord } from '../../src/short-horizon/signal-contract.js';

export const SHORT_HORIZON_SIGNAL_ARCHIVE_VERSION = 'short-horizon-signal-archive-v1';

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive:true });
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

function utcDay(timestampMs) {
  const date = new Date(Number(timestampMs));
  if (!Number.isFinite(date.getTime())) throw new Error('signal-archive-invalid-timestamp');
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return { year, month, isoDay:`${year}-${month}-${day}` };
}

function safeSegment(value, name) {
  const normalized = String(value || '').trim();
  if (!normalized || !/^[A-Za-z0-9._-]+$/.test(normalized)) throw new Error(`signal-archive-invalid-${name}`);
  return normalized;
}

export function signalArchiveRelativePath(record) {
  validateShortHorizonSignalRecord(record);
  const { year, month, isoDay } = utcDay(record.market.sourceTimestampMs);
  return path.posix.join(
    'data', 'short-horizon-signals',
    safeSegment(record.market.assetClass, 'asset-class').toLowerCase(),
    safeSegment(record.market.instrument, 'instrument'),
    `${Number(record.market.timeframeMinutes)}m`,
    year, month, `${isoDay}.ndjson`,
  );
}

function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return [];
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      const record = JSON.parse(line);
      validateShortHorizonSignalRecord(record);
      return record;
    } catch (error) {
      throw new Error(`signal-archive-invalid-line:${filePath}:${index + 1}:${error?.message || error}`);
    }
  });
}

function writeNdjsonAtomic(filePath, records) {
  ensureDir(path.dirname(filePath));
  const sorted = [...records].sort((a, b) =>
    Number(a.market?.sourceTimestampMs || 0) - Number(b.market?.sourceTimestampMs || 0) ||
    String(a.signalId).localeCompare(String(b.signalId)),
  );
  const body = `${sorted.map((record) => JSON.stringify(record)).join('\n')}\n`;
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, body, 'utf8');
  fs.renameSync(tempPath, filePath);
}

export function mergeSignalsIntoArchive({ rootDir, records, updatedAtMs = Date.now() } = {}) {
  if (!rootDir) throw new Error('signal-archive-root-required');
  if (!Array.isArray(records)) throw new Error('signal-archive-records-required');

  const grouped = new Map();
  for (const record of records) {
    validateShortHorizonSignalRecord(record);
    if (record.observationMode !== 'prospective' || record.observedProspectively !== true) {
      throw new Error('signal-archive-prospective-only');
    }
    const relativePath = signalArchiveRelativePath(record);
    if (!grouped.has(relativePath)) grouped.set(relativePath, []);
    grouped.get(relativePath).push(record);
  }

  const summary = { fetched:records.length, added:0, duplicates:0, filesTouched:0 };
  for (const [relativePath, incoming] of grouped.entries()) {
    const filePath = path.join(rootDir, ...relativePath.split('/'));
    const existingRecords = readNdjson(filePath);
    const existingLedger = {
      ...emptyShortHorizonSignalLedger(),
      records:existingRecords,
      updatedAtMs:null,
    };
    const merged = mergeProspectiveShortHorizonSignals(existingLedger, incoming, { updatedAtMs });
    summary.added += merged.summary.added;
    summary.duplicates += merged.summary.duplicates;
    if (merged.summary.added > 0) {
      writeNdjsonAtomic(filePath, merged.ledger.records);
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

export function inspectSignalArchive(rootDir) {
  const base = path.join(rootDir, 'data', 'short-horizon-signals');
  const files = walkFiles(base, (file) => file.endsWith('.ndjson')).sort();
  const records = files.flatMap(readNdjson).sort((a, b) =>
    Number(a.market.sourceTimestampMs) - Number(b.market.sourceTimestampMs) ||
    String(a.signalId).localeCompare(String(b.signalId)),
  );
  const ids = new Set();
  const streams = new Map();

  for (const record of records) {
    if (ids.has(record.signalId)) throw new Error(`signal-archive-duplicate-id:${record.signalId}`);
    ids.add(record.signalId);
    const key = `${record.market.instrument}-${record.market.timeframeMinutes}m`;
    if (!streams.has(key)) {
      streams.set(key, {
        id:key,
        assetClass:record.market.assetClass,
        instrument:record.market.instrument,
        venue:record.market.venue,
        timeframeMinutes:Number(record.market.timeframeMinutes),
        recordCount:0,
        counts:{ LONG:0, SHORT:0, WAIT:0 },
        firstSourceTimestampMs:null,
        lastSourceTimestampMs:null,
        primarySessions:{},
        canonicalRecords:[],
      });
    }
    const stream = streams.get(key);
    stream.recordCount += 1;
    stream.counts[record.decision.signal] += 1;
    stream.firstSourceTimestampMs = stream.firstSourceTimestampMs == null
      ? Number(record.market.sourceTimestampMs)
      : Math.min(stream.firstSourceTimestampMs, Number(record.market.sourceTimestampMs));
    stream.lastSourceTimestampMs = stream.lastSourceTimestampMs == null
      ? Number(record.market.sourceTimestampMs)
      : Math.max(stream.lastSourceTimestampMs, Number(record.market.sourceTimestampMs));
    const session = record.timeContext?.sessions?.primarySession || 'UNKNOWN';
    stream.primarySessions[session] = (stream.primarySessions[session] || 0) + 1;
    stream.canonicalRecords.push(JSON.stringify(record));
  }

  const streamSummaries = [...streams.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((stream) => ({
      id:stream.id,
      assetClass:stream.assetClass,
      instrument:stream.instrument,
      venue:stream.venue,
      timeframeMinutes:stream.timeframeMinutes,
      recordCount:stream.recordCount,
      counts:stream.counts,
      firstSourceTimestampMs:stream.firstSourceTimestampMs,
      lastSourceTimestampMs:stream.lastSourceTimestampMs,
      primarySessions:stream.primarySessions,
      contentSha256:sha256(stream.canonicalRecords.join('\n')),
    }));

  return {
    recordCount:records.length,
    fileCount:files.length,
    duplicateSignalIdCount:0,
    contentSha256:sha256(records.map((record) => JSON.stringify(record)).join('\n')),
    streams:streamSummaries,
  };
}

export function writeSignalArchiveManifest({ rootDir, lastRun } = {}) {
  if (!rootDir) throw new Error('signal-archive-root-required');
  const inspected = inspectSignalArchive(rootDir);
  const manifest = {
    schemaVersion:'short-horizon-signal-manifest-v1',
    archiveVersion:SHORT_HORIZON_SIGNAL_ARCHIVE_VERSION,
    updatedAtMs:Date.now(),
    storage:{
      kind:'github-generated-data-branch',
      branch:'short-horizon-signal-data',
      format:'ndjson-daily-utc',
      outcomesStoredSeparately:true,
    },
    methodology:{
      prospectiveOnly:true,
      directCurrentProviderFetch:true,
      humanCanonFrozenBenchmark:true,
      historicalReplayMixedIntoProspective:false,
      outcomeMutationForbidden:true,
      profitabilityClaim:false,
    },
    archive:inspected,
    lastRun,
    guardrails:{
      executionAuthorized:false,
      realMoneyRouting:false,
      orderSubmission:false,
      automaticPromotion:false,
      generatedDataOnly:true,
    },
  };
  const base = path.join(rootDir, 'data', 'short-horizon-signals');
  ensureDir(base);
  fs.writeFileSync(path.join(base, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}
