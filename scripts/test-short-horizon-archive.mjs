import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildClosedOhlcMarketEvent } from '../src/short-horizon/market-event.js';
import { inspectArchiveStream, mergeEventsIntoArchive, writeArchiveManifest } from './lib/short-horizon-archive.mjs';

const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicetrader-short-horizon-'));
const stream = { id:'BTCUSD-1m', instrument:'BTCUSD', venue:'kraken', timeframeMinutes:1 };
const event = (minute, close=100 + minute) => buildClosedOhlcMarketEvent({
  instrument:'BTCUSD', venue:'kraken', timeframeMinutes:1,
  sourceTimestampMs:Date.UTC(2026, 7, 20, 0, minute, 0),
  receivedTimestampMs:Date.UTC(2026, 7, 20, 1, 0, 0),
  open:close - 1, high:close + 1, low:close - 2, close, volume:10 + minute, trades:20 + minute,
  sourceId:'test-source',
});

try {
  const first = mergeEventsIntoArchive({ rootDir, events:[event(0), event(1), event(3)] });
  assert.equal(first.added, 3);
  const second = mergeEventsIntoArchive({ rootDir, events:[event(0), event(1)] });
  assert.equal(second.duplicates, 2);
  const inspected = inspectArchiveStream(rootDir, stream);
  assert.equal(inspected.recordCount, 3);
  assert.equal(inspected.gapCount, 1);
  assert.equal(inspected.missingBars, 1);
  assert.equal(inspected.duplicateKeyCount, 0);
  assert.throws(() => mergeEventsIntoArchive({ rootDir, events:[event(1, 999)] }), /market-data-conflict/);
  const manifest = writeArchiveManifest({ rootDir, streams:[stream], lastRun:{ status:'success' } });
  assert.equal(manifest.guardrails.realMoneyRouting, false);
  assert.equal(manifest.streams[0].recordCount, 3);
  assert.ok(fs.existsSync(path.join(rootDir, 'data', 'short-horizon', 'manifest.json')));
} finally {
  fs.rmSync(rootDir, { recursive:true, force:true });
}

console.log('short-horizon archive tests passed');
