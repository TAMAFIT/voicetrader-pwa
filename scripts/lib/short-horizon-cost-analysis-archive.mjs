import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateShortHorizonCostBreakEvenRecord } from '../../src/short-horizon/cost-break-even.js';

export const SHORT_HORIZON_COST_ANALYSIS_ARCHIVE_VERSION = 'short-horizon-cost-analysis-archive-v1';

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

function immutableAnalysisView(record) {
  const value = clone(record);
  delete value.analyzedAtMs;
  return value;
}

function utcDay(timestampMs) {
  const date = new Date(Number(timestampMs));
  if (!Number.isFinite(date.getTime())) throw new Error('cost-analysis-archive-invalid-timestamp');
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return { year, month, isoDay:`${year}-${month}-${day}` };
}

function safeSegment(value, name) {
  const normalized = String(value || '').trim();
  if (!normalized || !/^[A-Za-z0-9._-]+$/.test(normalized)) throw new Error(`cost-analysis-archive-invalid-${name}`);
  return normalized;
}

export function costAnalysisRelativePath(record) {
  validateShortHorizonCostBreakEvenRecord(record);
  const { year, month, isoDay } = utcDay(record.horizon.targetCloseTimestampMs);
  return path.posix.join(
    'data', 'short-horizon-cost-analysis',
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
      validateShortHorizonCostBreakEvenRecord(record);
      return record;
    } catch (error) {
      throw new Error(`cost-analysis-archive-invalid-line:${filePath}:${index + 1}:${error?.message || error}`);
    }
  });
}

function writeNdjsonAtomic(filePath, records) {
  ensureDir(path.dirname(filePath));
  const sorted = [...records].sort((a, b) =>
    Number(a.horizon?.targetCloseTimestampMs || 0) - Number(b.horizon?.targetCloseTimestampMs || 0) ||
    String(a.analysisId).localeCompare(String(b.analysisId)),
  );
  const body = `${sorted.map((record) => JSON.stringify(record)).join('\n')}\n`;
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, body, 'utf8');
  fs.renameSync(tempPath, filePath);
}

export function mergeCostAnalysesIntoArchive({ rootDir, records } = {}) {
  if (!rootDir) throw new Error('cost-analysis-archive-root-required');
  if (!Array.isArray(records)) throw new Error('cost-analysis-archive-records-required');
  const grouped = new Map();
  for (const record of records) {
    validateShortHorizonCostBreakEvenRecord(record);
    const relativePath = costAnalysisRelativePath(record);
    if (!grouped.has(relativePath)) grouped.set(relativePath, []);
    grouped.get(relativePath).push(record);
  }

  const summary = { fetched:records.length, added:0, duplicates:0, filesTouched:0 };
  for (const [relativePath, incoming] of grouped.entries()) {
    const filePath = path.join(rootDir, ...relativePath.split('/'));
    const existing = readNdjson(filePath);
    const map = new Map();
    for (const record of existing) {
      if (map.has(record.analysisId)) throw new Error(`cost-analysis-archive-duplicate-existing:${record.analysisId}`);
      map.set(record.analysisId, record);
    }
    let changed = false;
    for (const record of incoming) {
      const prior = map.get(record.analysisId);
      if (!prior) {
        map.set(record.analysisId, record);
        summary.added += 1;
        changed = true;
        continue;
      }
      if (canonical(immutableAnalysisView(prior)) !== canonical(immutableAnalysisView(record))) {
        throw new Error(`short-horizon-cost-analysis-immutability-conflict:${record.analysisId}`);
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

export function readCostAnalysisRecords(rootDir) {
  const base = path.join(rootDir, 'data', 'short-horizon-cost-analysis');
  const files = walkFiles(base).sort();
  const records = files.flatMap(readNdjson).sort((a, b) =>
    Number(a.horizon?.targetCloseTimestampMs || 0) - Number(b.horizon?.targetCloseTimestampMs || 0) ||
    String(a.analysisId).localeCompare(String(b.analysisId)),
  );
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.analysisId)) throw new Error(`cost-analysis-archive-duplicate-id:${record.analysisId}`);
    ids.add(record.analysisId);
  }
  return { files, records };
}

function finite(values) {
  return values
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function mean(values) {
  const list = finite(values);
  return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null;
}

function percentile(values, p) {
  const list = finite(values);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const index = (list.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return list[low];
  const weight = index - low;
  return list[low] * (1 - weight) + list[high] * weight;
}

function round(value, digits = 6) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
}

function groupId(record) {
  const session = record.context.primarySession || 'UNKNOWN';
  const regime = record.context.regime || 'UNKNOWN';
  return `${record.market.instrument}-${record.market.timeframeMinutes}m-${record.horizon.kind}-${record.horizon.minutes}m-${session}-${regime}`;
}

function summarizeGroup(id, items) {
  const directional = items.filter((item) => item.gross.directionalTrade === true);
  const grossBps = directional.map((item) => item.gross.grossDirectionalReturnBps);
  const budgets = directional.map((item) => item.costEnvelope.breakEvenRoundTripCostBps);
  const positiveBudget = directional.filter((item) => item.costEnvelope.positiveCostBudgetExists === true);
  return {
    id,
    assetClass:items[0].market.assetClass,
    instrument:items[0].market.instrument,
    venue:items[0].market.venue,
    timeframeMinutes:Number(items[0].market.timeframeMinutes),
    horizonKind:items[0].horizon.kind,
    horizonMinutes:Number(items[0].horizon.minutes),
    primarySession:items[0].context.primarySession || null,
    regime:items[0].context.regime || null,
    recordCount:items.length,
    directionalCount:directional.length,
    waitCount:items.filter((item) => item.context.signal === 'WAIT').length,
    directionalOutcomeCounts:{
      WIN:directional.filter((item) => item.gross.rawOutcomeClass === 'WIN').length,
      LOSS:directional.filter((item) => item.gross.rawOutcomeClass === 'LOSS').length,
      FLAT:directional.filter((item) => item.gross.rawOutcomeClass === 'FLAT').length,
    },
    breakEvenEvidence:{
      positiveCostBudgetCount:positiveBudget.length,
      positiveCostBudgetRate:directional.length ? round(positiveBudget.length / directional.length) : null,
      meanGrossDirectionalReturnBps:round(mean(grossBps)),
      medianGrossDirectionalReturnBps:round(percentile(grossBps, 0.5)),
      meanBreakEvenRoundTripCostBps:round(mean(budgets)),
      p25BreakEvenRoundTripCostBps:round(percentile(budgets, 0.25)),
      medianBreakEvenRoundTripCostBps:round(percentile(budgets, 0.5)),
      p75BreakEvenRoundTripCostBps:round(percentile(budgets, 0.75)),
      maximumObservedBreakEvenRoundTripCostBps:budgets.length ? round(Math.max(...budgets)) : null,
    },
    costBinding:{
      status:'UNBOUND',
      actualRoundTripCostBps:null,
      providerCostClaim:false,
      netReturnAvailable:false,
      profitabilityClaim:false,
    },
    firstTargetCloseTimestampMs:Math.min(...items.map((item) => Number(item.horizon.targetCloseTimestampMs))),
    lastTargetCloseTimestampMs:Math.max(...items.map((item) => Number(item.horizon.targetCloseTimestampMs))),
    contentSha256:sha256(items.map((item) => JSON.stringify(item)).join('\n')),
  };
}

export function inspectCostAnalysisArchive(rootDir) {
  const { files, records } = readCostAnalysisRecords(rootDir);
  const groups = new Map();
  for (const record of records) {
    const key = groupId(record);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return {
    recordCount:records.length,
    fileCount:files.length,
    duplicateAnalysisIdCount:0,
    contentSha256:sha256(records.map((record) => JSON.stringify(record)).join('\n')),
    groups:[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, items]) => summarizeGroup(id, items)),
  };
}

export function writeCostAnalysisManifest({ rootDir, lastRun } = {}) {
  if (!rootDir) throw new Error('cost-analysis-archive-root-required');
  const inspected = inspectCostAnalysisArchive(rootDir);
  const manifest = {
    schemaVersion:'short-horizon-cost-analysis-manifest-v1',
    archiveVersion:SHORT_HORIZON_COST_ANALYSIS_ARCHIVE_VERSION,
    updatedAtMs:Date.now(),
    storage:{
      kind:'github-generated-data-branch',
      branch:'short-horizon-cost-analysis-data',
      sourceOutcomesBranch:'short-horizon-outcome-data',
      format:'ndjson-daily-utc',
    },
    methodology:{
      descriptiveOnly:true,
      optimizer:false,
      breakEvenFromGrossOutcomeOnly:true,
      providerCostBinding:false,
      arbitraryCostScenarioGrid:false,
      changesHumanCanonThresholds:false,
      netReturnAvailable:false,
      profitabilityClaim:false,
    },
    archive:inspected,
    lastRun,
    guardrails:{
      usedByDecisionEngine:false,
      automaticPromotion:false,
      executionAuthorized:false,
      realMoneyRouting:false,
      orderSubmission:false,
      generatedDataOnly:true,
    },
  };
  const base = path.join(rootDir, 'data', 'short-horizon-cost-analysis');
  ensureDir(base);
  fs.writeFileSync(path.join(base, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}
