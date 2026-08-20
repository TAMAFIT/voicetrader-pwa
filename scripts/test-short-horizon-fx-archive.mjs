import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildClosedOhlcMarketEvent } from '../src/short-horizon/market-event.js';
import {
  archiveRelativePath,
  inspectArchiveStream,
  mergeEventsIntoArchive,
  writeArchiveManifest,
} from './lib/short-horizon-archive.mjs';

const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicetrader-fx-archive-'));
const first = buildClosedOhlcMarketEvent({
  assetClass:'fx', instrument:'USDJPY', venue:'dukascopy', timeframeMinutes:1,
  sourceTimestampMs:Date.UTC(2026, 7, 21, 20, 59), receivedTimestampMs:Date.UTC(2026, 7, 21, 21, 1),
  open:150, high:150.02, low:149.99, close:150.01, volume:10, trades:0,
  sourceId:'test-fx',
});
const afterWeekend = buildClosedOhlcMarketEvent({
  ...first,
  sourceTimestampMs:Date.UTC(2026, 7, 23, 21, 1),
  receivedTimestampMs:Date.UTC(2026, 7, 23, 21, 2),
  open:150.1, high:150.12, low:150.09, close:150.11,
});

assert.match(archiveRelativePath(first), /^data\/short-horizon\/fx\/USDJPY\/1m\//);
const merged = mergeEventsIntoArchive({ rootDir, events:[first, afterWeekend] });
assert.equal(merged.added, 2);
assert.equal(merged.conflicts, 0);

const stream = {
  id:'USDJPY-1m', assetClass:'fx', instrument:'USDJPY', venue:'dukascopy',
  timeframeMinutes:1, expectedContinuity:'sessioned',
};
const inspected = inspectArchiveStream(rootDir, stream);
assert.equal(inspected.recordCount, 2);
assert.equal(inspected.continuityMode, 'sessioned');
assert.equal(inspected.gapCount, null);
assert.equal(inspected.missingBars, null);
assert.equal(inspected.rawGapCount, 1);
assert.ok(inspected.largestGapMinutes > 1000);

const manifest = writeArchiveManifest({
  rootDir,
  streams:[stream],
  lastRun:{ status:'success' },
  manifestFile:'fx-manifest.json',
  source:{ provider:'test-fx-provider', sessionAware:true },
});
assert.equal(manifest.source.provider, 'test-fx-provider');
assert.equal(manifest.streams[0].gapCount, null);
assert.ok(fs.existsSync(path.join(rootDir, 'data', 'short-horizon', 'fx-manifest.json')));

fs.rmSync(rootDir, { recursive:true, force:true });
console.log('short-horizon FX archive tests passed');
