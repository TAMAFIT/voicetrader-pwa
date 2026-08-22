import assert from 'node:assert/strict';
import path from 'node:path';
import { buildGmoFxPublicQuote } from '../src/short-horizon/gmo-fx-public-quote.js';
import {
  LOCAL_NODE_NETWORK_POLICY,
  LOCAL_NODE_RUNTIME_POLICY_ID,
  buildLocalNodeStoragePaths,
  buildLocalNodeTickRecord,
  classifyRepeatedQuote,
  utcPartition,
  validateLocalNodeTickRecord,
} from '../src/short-horizon/local-node-gmo-tick.js';

const receivedTimestampMs = Date.parse('2026-08-22T01:02:03.456Z');
const quote = buildGmoFxPublicQuote({
  symbol:'USD_JPY',
  status:'OPEN',
  bid:'158.700',
  ask:'158.705',
  timestamp:'2026-08-22T01:02:03.400Z',
}, { receivedTimestampMs });

assert.deepEqual(utcPartition(receivedTimestampMs), {
  year:'2026', month:'08', day:'22', hour:'01',
});

const paths = buildLocalNodeStoragePaths(path.join(process.cwd(), 'tmp-local-node'), receivedTimestampMs);
assert.equal(path.basename(paths.rawFile), '01.ndjson');
assert.ok(paths.rawFile.includes(path.join('raw', 'gmo-fx', 'USDJPY', '2026', '08', '22')));

const record = buildLocalNodeTickRecord(quote, {
  nodeId:'TEST-NODE',
  processStartedAtMs:receivedTimestampMs - 1000,
  connectionId:'test-1',
  sequence:1,
});
assert.equal(validateLocalNodeTickRecord(record), true);
assert.equal(record.capture.runtimePolicyId, LOCAL_NODE_RUNTIME_POLICY_ID);
assert.equal(record.quote.quoteId, quote.quoteId);
assert.equal(record.capture.storageTimeBasis, 'RECEIVED_UTC_HOURLY');
assert.equal(record.capture.immutableRaw, true);

const serialized = JSON.stringify(record);
assert.equal(serialized.includes('allowedRuntimeEndpoints'), false, 'per-tick raw rows must not repeat full runtime policy');
assert.equal(serialized.includes('googleCloudEnabled'), false, 'per-tick raw rows must not repeat cloud policy');

assert.equal(LOCAL_NODE_NETWORK_POLICY.googleCloudEnabled, false);
assert.equal(LOCAL_NODE_NETWORK_POLICY.cloudUploadEnabled, false);
assert.equal(LOCAL_NODE_NETWORK_POLICY.githubActionsRequired, false);
assert.equal(LOCAL_NODE_NETWORK_POLICY.telemetryEnabled, false);
assert.deepEqual(LOCAL_NODE_NETWORK_POLICY.allowedRuntimeEndpoints, [
  'wss://forex-api.coin.z.com/ws/public/v1',
]);

assert.equal(classifyRepeatedQuote(null, quote), 'NEW');
assert.equal(classifyRepeatedQuote(quote, quote), 'DUPLICATE');
const conflict = structuredClone(quote);
conflict.quote.ask = 158.706;
assert.equal(classifyRepeatedQuote(quote, conflict), 'CONFLICT');

assert.throws(() => validateLocalNodeTickRecord({
  ...record,
  capture:{ ...record.capture, runtimePolicyId:'cloud-upload-enabled' },
}), /local-node-cloud-policy-invalid/);

console.log('short-horizon local-node tests: PASS');
