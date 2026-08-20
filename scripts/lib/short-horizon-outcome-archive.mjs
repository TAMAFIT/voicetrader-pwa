import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateShortHorizonOutcomeRecord } from '../../src/short-horizon/outcome-contract.js';

export const SHORT_HORIZON_OUTCOME_ARCHIVE_VERSION = 'short-horizon-outcome-archive-v1';

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive:true });
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

const canonical = (value) => JSON.stringify(stable(value));

function immutableOutcomeView(record) {
  const value = clone(record);
  delete value.maturedAtMs;
  return value;
}

function utcDay(timestampMs) {
  const date = new Date(Number(timestampMs));
  if (!Number.isFinite(date.getTime())) throw new Error('outcome-archive-invalid-timestamp');
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return { year, month, isoDay:`${year}-${month}-${day}` };
}

function safeSegment(value, name) {
  const normalized = String(value || '').trim();
  if (!normalized || !/^[A-Za-z0-9._-]+$/.test(normalized)) throw new Error(`outcome-archive-invalid-${name}`);
  return normalized;
}

export function outcomeArchiveRelativePath(record) {
  validateShortHorizonOutcomeRecord(record);
  const { year, month, isoDay } = utcDay(record.targetCloseTimestampMs);
  return path.posix.join(
    'data', 'short-horizon-outcomes',
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
      validateShortHorizonOutcomeRecord(record);
      return record;
    } catch (error) {
      throw new Error(`outcome-archive-invalid-line:${filePath}:${index + 1}:${error?.message || error}`);
    }
  });
}

function writeNdjsonAtomic(filePath, records) {
  ensureDir(path.dirname(filePath));
  const sorted = [...records].sort((a, b) =>
    Number(a.targetCloseTimestampMs || 0) - Number(b.targetCloseTimestampMs || 0) ||
    String(a.outcomeId).localeCompare(String(b.outcomeId)),
  );
  const body = `${sorted.map((record) => JSON.stringify(record)).join('\n')}\n`;
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, body, 'utf8');
  fs.renameSync(tempPath, filePath);
}

export function mergeOutcomesIntoArchive({ rootDir, records } = {}) {
  if (!rootDir) throw new Error('outcome-archive-root-required');
  if (!Array.isArray(records)) throw new Error('outcome-archive-records-required');
  const grouped = new Map();
  for (const record of records) {
    validateShortHorizonOutcomeRecord(record);
    const relativePath = outcomeArchiveRelativePath(record);
    if (!grouped.has(relativePath)) grouped.set(relativePath, []);
    grouped.get(relativePath).push(record);
  }

  const summary = { fetched:records.length, added:0, duplicates:0, filesTouched:0 };
  for (const [relativePath, incoming] of grouped.entries()) {
    const filePath = path.join(rootDir, ...relativePath.split('/'));
    const existing = readNdjson(filePath);
    const map = new Map();
    for (const record of existing) {
      if (map.has(record.outcomeId)) throw new Error(`outcome-archive-duplicate-existing:${record.outcomeId}`);
      map.set(record.outcomeId, record);
    }
    let changed = false;
    for (const record of incoming) {
      const prior = map.get(record.outcomeId);
      if (!prior) {
        map.set(record.outcomeId, record);
        summary.added += 1;
        changed = true;
        continue;
      }
      if (canonical(immutableOutcomeView(prior)) !== canonical(immutableOutcomeView(record))) {
        throw new Error(`short-horizon-outcome-immutability-conflict:${record.outcomeId}`);
      }
      summary.duplicates += 1;
    }
    if (changed) {
      writeNdjsonAtomic(filePath, [...map.values()]);
      summary.filesTouched += 1;
    }
  }
  return summary;
}

function walkFiles(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, output);
    else if (entry.isFile() && entry.name.endsWith('.ndjson')) output.push(full);
  }
  return output;
}

export function readOutcomeArchiveRecords(rootDir) {
  const base = path.join(rootDir, 'data', 'short-horizon-outcomes');
  const files = walkFiles(base).sort();
  const records = files.flatMap(readNdjson).sort((a, b) =>
    Number(a.targetCloseTimestampMs || 0) - Number(b.targetCloseTimestampMs || 0) ||
    String(a.outcomeId).localeCompare(String(b.outcomeId)),
  );
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.outcomeId)) throw new Error(`outcome-archive-duplicate-id:${record.outcomeId}`);
    ids.add(record.outcomeId);
  }
  return { files, records };
}

function mean(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

export function inspectOutcomeArchive(rootDir) {
  const { files, records } = readOutcomeArchiveRecords(rootDir);
  const groups = new Map();
  for (const record of records) {
    const key = `${record.market.instrument}-${record.market.timeframeMinutes}m-${record.horizonKind}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const streams = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, items]) => {
    const directional = items.filter((item) => item.decision.signal !== 'WAIT');
    const rawReturns = directional.map((item) => item.result.rawDirectionalReturnPct).filter(Number.isFinite);
    const mfes = directional.map((item) => item.result.mfePct).filter(Number.isFinite);
    const maes = directional.map((item) => item.result.maePct).filter(Number.isFinite);
    return {
      id,
      assetClass:items[0].market.assetClass,
      instrument:items[0].market.instrument,
      venue:items[0].market.venue,
      timeframeMinutes:Number(items[0].market.timeframeMinutes),
      horizonKind:items[0].horizonKind,
      horizonMinutes:Number(items[0].horizonMinutes),
      recordCount:items.length,
      signalCounts:{
        LONG:items.filter((item) => item.decision.signal === 'LONG').length,
        SHORT:items.filter((item) => item.decision.signal === 'SHORT').length,
        WAIT:items.filter((item) => item.decision.signal === 'WAIT').length,
      },
      directionalOutcomeCounts:{
        WIN:directional.filter((item) => item.result.rawOutcomeClass === 'WIN').length,
        LOSS:directional.filter((item) => item.result.rawOutcomeClass === 'LOSS').length,
        FLAT:directional.filter((item) => item.result.rawOutcomeClass === 'FLAT').length,
      },
      descriptiveMetrics:{
        meanRawDirectionalReturnPct:mean(rawReturns),
        meanMfePct:mean(mfes),
        meanMaePct:mean(maes),
        transactionCostsModeled:false,
        netReturnAvailable:false,
      },
      firstTargetCloseTimestampMs:Math.min(...items.map((item) => Number(item.targetCloseTimestampMs))),
      lastTargetCloseTimestampMs:Math.max(...items.map((item) => Number(item.targetCloseTimestampMs))),
      contentSha256:sha256(items.map((item) => JSON.stringify(item)).join('\n')),
    };
  });

  return {
    recordCount:records.length,
    fileCount:files.length,
    duplicateOutcomeIdCount:0,
    contentSha256:sha256(records.map((record) => JSON.stringify(record)).join('\n')),
    streams,
  };
}

export function writeOutcomeArchiveManifest({ rootDir, lastRun } = {}) {
  if (!rootDir) throw new Error('outcome-archive-root-required');
  const inspected = inspectOutcomeArchive(rootDir);
  const manifest = {
    schemaVersion:'short-horizon-outcome-manifest-v1',
    archiveVersion:SHORT_HORIZON_OUTCOME_ARCHIVE_VERSION,
    updatedAtMs:Date.now(),
    storage:{
      kind:'github-generated-data-branch',
      branch:'short-horizon-outcome-data',
      format:'ndjson-daily-utc',
      sourceSignalsBranch:'short-horizon-signal-data',
    },
    methodology:{
      prospectiveSignalsOnly:true,
      outcomesSeparateFromSignals:true,
      exactAlignedClosedBars:true,
      unresolvedMissingDataNotFrozenAsOutcome:true,
      transactionCostsModeled:false,
      netReturnAvailable:false,
      profitabilityClaim:false,
    },
    archive:inspected,
    lastRun,
    guardrails:{
      mutatesSignalRecords:false,
      usedByDecisionEngine:false,
      automaticPromotion:false,
      executionAuthorized:false,
      realMoneyRouting:false,
      orderSubmission:false,
      generatedDataOnly:true,
    },
  };
  const base = path.join(rootDir, 'data', 'short-horizon-outcomes');
  ensureDir(base);
  fs.writeFileSync(path.join(base, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}
