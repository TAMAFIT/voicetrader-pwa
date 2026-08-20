import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateGmoFxPublicQuote } from '../../src/short-horizon/gmo-fx-public-quote.js';

export const GMO_FX_QUOTE_ARCHIVE_VERSION = 'gmo-fx-quote-archive-v1';
const ensureDir = (dir) => fs.mkdirSync(dir, { recursive:true });
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
const canonical = (value) => JSON.stringify(stable(value));
function immutableView(record) {
  const value = clone(record);
  delete value.timing.receivedTimestampMs;
  delete value.timing.receiveMinusSourceMs;
  return value;
}
function dayParts(timestampMs) {
  const date = new Date(Number(timestampMs));
  if (!Number.isFinite(date.getTime())) throw new Error('gmo-quote-archive-time-invalid');
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return { year, month, isoDay:`${year}-${month}-${day}` };
}
export function gmoQuoteRelativePath(record) {
  validateGmoFxPublicQuote(record);
  const { year, month, isoDay } = dayParts(record.timing.sourceTimestampMs);
  return path.posix.join('data','short-horizon-gmo-quotes','USDJPY',year,month,`${isoDay}.ndjson`);
}
function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return [];
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      const record = JSON.parse(line);
      validateGmoFxPublicQuote(record);
      return record;
    } catch (error) {
      throw new Error(`gmo-quote-archive-invalid-line:${filePath}:${index + 1}:${error?.message || error}`);
    }
  });
}
function writeAtomic(filePath, records) {
  ensureDir(path.dirname(filePath));
  const body = `${[...records].sort((a,b) => a.timing.sourceTimestampMs - b.timing.sourceTimestampMs || a.quoteId.localeCompare(b.quoteId)).map(JSON.stringify).join('\n')}\n`;
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, body, 'utf8');
  fs.renameSync(tmp, filePath);
}
export function mergeGmoQuotesIntoArchive({ rootDir, records } = {}) {
  if (!rootDir) throw new Error('gmo-quote-archive-root-required');
  if (!Array.isArray(records)) throw new Error('gmo-quote-archive-records-required');
  const groups = new Map();
  for (const record of records) {
    validateGmoFxPublicQuote(record);
    const relative = gmoQuoteRelativePath(record);
    if (!groups.has(relative)) groups.set(relative, []);
    groups.get(relative).push(record);
  }
  const summary = { fetched:records.length, added:0, duplicates:0, filesTouched:0 };
  for (const [relative, incoming] of groups) {
    const filePath = path.join(rootDir, ...relative.split('/'));
    const existing = readNdjson(filePath);
    const map = new Map(existing.map((record) => [record.quoteId, record]));
    if (map.size !== existing.length) throw new Error('gmo-quote-archive-duplicate-existing');
    let changed = false;
    for (const record of incoming) {
      const prior = map.get(record.quoteId);
      if (!prior) {
        map.set(record.quoteId, record);
        summary.added += 1;
        changed = true;
      } else if (canonical(immutableView(prior)) === canonical(immutableView(record))) {
        summary.duplicates += 1;
      } else {
        throw new Error(`gmo-quote-archive-immutability-conflict:${record.quoteId}`);
      }
    }
    if (changed) {
      writeAtomic(filePath, [...map.values()]);
      summary.filesTouched += 1;
    }
  }
  return summary;
}
function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (entry.isFile() && entry.name.endsWith('.ndjson')) output.push(full);
  }
  return output;
}
export function readGmoQuoteArchive(rootDir) {
  const base = path.join(rootDir, 'data', 'short-horizon-gmo-quotes');
  const files = walk(base).sort();
  const records = files.flatMap(readNdjson).sort((a,b) => a.timing.sourceTimestampMs - b.timing.sourceTimestampMs || a.quoteId.localeCompare(b.quoteId));
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.quoteId)) throw new Error(`gmo-quote-archive-duplicate-id:${record.quoteId}`);
    ids.add(record.quoteId);
  }
  return { files, records };
}
export function writeGmoQuoteManifest({ rootDir, lastRun } = {}) {
  const { files, records } = readGmoQuoteArchive(rootDir);
  const open = records.filter((record) => record.quote.marketStatus === 'OPEN');
  const spreads = open.map((record) => Number(record.quote.spreadBps)).filter(Number.isFinite);
  const manifest = {
    schemaVersion:'gmo-fx-quote-manifest-v1',
    archiveVersion:GMO_FX_QUOTE_ARCHIVE_VERSION,
    updatedAtMs:Date.now(),
    storage:{ kind:'github-generated-data-branch', branch:'short-horizon-gmo-quote-data', format:'ndjson-daily-utc' },
    scope:{ providerId:'gmo-coin-fx-public-v1', instrument:'USDJPY', providerInstrument:'USD_JPY', sampleCadenceMinutes:5, continuousCapture:false },
    archive:{
      recordCount:records.length,
      fileCount:files.length,
      duplicateQuoteIdCount:0,
      openQuoteCount:open.length,
      firstSourceTimestampMs:records[0]?.timing.sourceTimestampMs ?? null,
      lastSourceTimestampMs:records.at(-1)?.timing.sourceTimestampMs ?? null,
      meanObservedSpreadBps:spreads.length ? spreads.reduce((sum,value)=>sum+value,0)/spreads.length : null,
      contentSha256:sha256(records.map(JSON.stringify).join('\n')),
    },
    lastRun,
    guardrails:{ authenticationRequired:false, accountSpecificPricing:false, fillObserved:false, executionAuthorized:false, realMoneyRouting:false, orderSubmission:false, generatedDataOnly:true },
  };
  const base = path.join(rootDir, 'data', 'short-horizon-gmo-quotes');
  ensureDir(base);
  fs.writeFileSync(path.join(base, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}
