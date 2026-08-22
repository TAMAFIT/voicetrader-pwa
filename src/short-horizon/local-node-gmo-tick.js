import path from 'node:path';

export const LOCAL_NODE_GMO_TICK_SCHEMA = 'voicetrader-local-gmo-tick-v1';
export const LOCAL_NODE_GMO_TICK_COLLECTOR = 'voicetrader-local-node-gmo-tick-v1';
export const LOCAL_NODE_RUNTIME_POLICY_ID = 'local-only-gmo-public-v1';

export const LOCAL_NODE_NETWORK_POLICY = Object.freeze({
  policyId:LOCAL_NODE_RUNTIME_POLICY_ID,
  googleCloudEnabled:false,
  cloudUploadEnabled:false,
  githubActionsRequired:false,
  telemetryEnabled:false,
  allowedRuntimeEndpoints:Object.freeze([
    'wss://forex-api.coin.z.com/ws/public/v1',
  ]),
});

const pad2 = (value) => String(value).padStart(2, '0');

export function utcPartition(receivedTimestampMs) {
  const value = Number(receivedTimestampMs);
  if (!Number.isFinite(value) || value < 0) throw new Error('local-node-received-time-invalid');
  const date = new Date(value);
  return {
    year:String(date.getUTCFullYear()),
    month:pad2(date.getUTCMonth() + 1),
    day:pad2(date.getUTCDate()),
    hour:pad2(date.getUTCHours()),
  };
}

export function buildLocalNodeStoragePaths(rootDir, receivedTimestampMs) {
  if (!rootDir || typeof rootDir !== 'string') throw new Error('local-node-root-required');
  const partition = utcPartition(receivedTimestampMs);
  const root = path.resolve(rootDir);
  const rawDir = path.join(root, 'raw', 'gmo-fx', 'USDJPY', partition.year, partition.month, partition.day);
  const logDir = path.join(root, 'logs', 'local-node', partition.year, partition.month);
  return {
    rootDir:root,
    rawDir,
    rawFile:path.join(rawDir, `${partition.hour}.ndjson`),
    stateDir:path.join(root, 'state'),
    healthFile:path.join(root, 'state', 'local-node-health.json'),
    lastQuoteFile:path.join(root, 'state', 'local-node-last-quote.json'),
    logDir,
    logFile:path.join(logDir, `${partition.day}.ndjson`),
  };
}

export function buildLocalNodeTickRecord(quote, {
  nodeId,
  processStartedAtMs,
  connectionId,
  sequence,
} = {}) {
  if (!quote?.quoteId || !quote?.timing || !quote?.quote) throw new Error('local-node-quote-required');
  const seq = Number(sequence);
  if (!Number.isInteger(seq) || seq < 1) throw new Error('local-node-sequence-invalid');
  const record = {
    schemaVersion:LOCAL_NODE_GMO_TICK_SCHEMA,
    capture:{
      collectorVersion:LOCAL_NODE_GMO_TICK_COLLECTOR,
      nodeId:String(nodeId || 'unknown'),
      processStartedAtMs:Number(processStartedAtMs),
      connectionId:String(connectionId || ''),
      sequence:seq,
      receivedTimestampMs:Number(quote.timing.receivedTimestampMs),
      storageTimeBasis:'RECEIVED_UTC_HOURLY',
      immutableRaw:true,
      runtimePolicyId:LOCAL_NODE_RUNTIME_POLICY_ID,
    },
    quote,
  };
  validateLocalNodeTickRecord(record);
  return record;
}

export function validateLocalNodeTickRecord(record) {
  if (!record || record.schemaVersion !== LOCAL_NODE_GMO_TICK_SCHEMA) throw new Error('local-node-schema-invalid');
  if (record.capture?.collectorVersion !== LOCAL_NODE_GMO_TICK_COLLECTOR) throw new Error('local-node-collector-invalid');
  if (!Number.isInteger(record.capture?.sequence) || record.capture.sequence < 1) throw new Error('local-node-sequence-invalid');
  if (!Number.isFinite(record.capture?.receivedTimestampMs)) throw new Error('local-node-received-time-invalid');
  if (!record.quote?.quoteId || record.quote?.provider?.providerId !== 'gmo-coin-fx-public-v1') throw new Error('local-node-provider-invalid');
  if (record.capture?.runtimePolicyId !== LOCAL_NODE_RUNTIME_POLICY_ID) throw new Error('local-node-cloud-policy-invalid');
  if (record.capture?.immutableRaw !== true || record.capture?.storageTimeBasis !== 'RECEIVED_UTC_HOURLY') throw new Error('local-node-storage-contract-invalid');
  return true;
}

export function classifyRepeatedQuote(previousQuote, nextQuote) {
  if (!previousQuote || previousQuote.quoteId !== nextQuote?.quoteId) return 'NEW';
  const previousEconomic = JSON.stringify({
    provider:previousQuote.provider,
    timing:{ sourceTimestampMs:previousQuote.timing?.sourceTimestampMs },
    quote:previousQuote.quote,
  });
  const nextEconomic = JSON.stringify({
    provider:nextQuote.provider,
    timing:{ sourceTimestampMs:nextQuote.timing?.sourceTimestampMs },
    quote:nextQuote.quote,
  });
  return previousEconomic === nextEconomic ? 'DUPLICATE' : 'CONFLICT';
}
