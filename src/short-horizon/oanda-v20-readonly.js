import { OANDA_JAPAN_NY_PRO_REST_V1 } from './deployability-registry.js';
import { buildOandaExecutableQuoteFromClientPrice } from './executable-quote-contract.js';

export const SHORT_HORIZON_OANDA_READONLY_VERSION = 'short-horizon-oanda-v20-readonly-v1';

const ALLOWED_INSTRUMENT = 'USD_JPY';
const ALLOWED_READ_PATHS = Object.freeze([
  /^\/v3\/accounts\/[^/]+\/pricing$/,
  /^\/v3\/accounts\/[^/]+\/pricing\/stream$/,
]);

function nonEmpty(value, name) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`oanda-readonly-${name}-required`);
  return text;
}

function accountPathId(accountId) {
  const text = nonEmpty(accountId, 'account-id');
  if (!/^[A-Za-z0-9-]+$/.test(text)) throw new Error('oanda-readonly-account-id-invalid');
  return text;
}

function environmentBases(environment) {
  if (environment === 'practice') {
    return {
      rest:OANDA_JAPAN_NY_PRO_REST_V1.api.practiceRestBaseUrl,
      stream:OANDA_JAPAN_NY_PRO_REST_V1.api.practiceStreamBaseUrl,
    };
  }
  if (environment === 'live') {
    return {
      rest:OANDA_JAPAN_NY_PRO_REST_V1.api.liveRestBaseUrl,
      stream:OANDA_JAPAN_NY_PRO_REST_V1.api.liveStreamBaseUrl,
    };
  }
  throw new Error('oanda-readonly-environment-invalid');
}

export function assertOandaReadonlyTarget({ method = 'GET', path } = {}) {
  const normalizedMethod = String(method || '').toUpperCase();
  if (normalizedMethod !== 'GET') throw new Error('oanda-readonly-method-blocked');
  const normalizedPath = nonEmpty(path, 'path');
  if (!ALLOWED_READ_PATHS.some((pattern) => pattern.test(normalizedPath))) {
    throw new Error('oanda-readonly-path-blocked');
  }
  if (/\/(orders|trades|positions)(?:\/|$)/i.test(normalizedPath)) throw new Error('oanda-readonly-mutation-surface-blocked');
  return true;
}

function buildUrl(base, path, params) {
  assertOandaReadonlyTarget({ method:'GET', path });
  const url = new URL(path, `${base.replace(/\/$/, '')}/`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function bearerHeaders(token) {
  return {
    Accept:'application/json',
    Authorization:`Bearer ${token}`,
    'Accept-Datetime-Format':'RFC3339',
  };
}

async function safeJson(response) {
  if (!response || typeof response !== 'object') throw new Error('oanda-readonly-response-invalid');
  if (!response.ok) {
    const status = Number(response.status);
    throw new Error(`oanda-readonly-http-${Number.isFinite(status) ? status : 'error'}`);
  }
  if (typeof response.json !== 'function') throw new Error('oanda-readonly-json-response-required');
  return response.json();
}

function findUsdJpyPrice(payload) {
  const prices = Array.isArray(payload?.prices) ? payload.prices : [];
  const matches = prices.filter((price) => price?.instrument === ALLOWED_INSTRUMENT);
  if (matches.length !== 1) throw new Error(`oanda-readonly-usdjpy-price-count:${matches.length}`);
  return matches[0];
}

function parseStreamObject(value, { environment, receivedTimestampMs }) {
  if (!value || typeof value !== 'object') throw new Error('oanda-readonly-stream-object-invalid');
  if (value.type === 'HEARTBEAT') {
    const sourceTimestampMs = Date.parse(nonEmpty(value.time, 'heartbeat-time'));
    if (!Number.isFinite(sourceTimestampMs)) throw new Error('oanda-readonly-heartbeat-time-invalid');
    return {
      type:'HEARTBEAT',
      providerId:OANDA_JAPAN_NY_PRO_REST_V1.providerId,
      environment,
      sourceTimestampMs,
      receivedTimestampMs:Number(receivedTimestampMs),
    };
  }
  return {
    type:'QUOTE',
    quote:buildOandaExecutableQuoteFromClientPrice({
      clientPrice:value,
      environment,
      receivedTimestampMs,
      transport:'PRICING_STREAM',
      providerId:OANDA_JAPAN_NY_PRO_REST_V1.providerId,
    }),
  };
}

export function parseOandaPricingStreamLine(line, {
  environment = 'practice',
  receivedTimestampMs = Date.now(),
} = {}) {
  const text = String(line ?? '').trim();
  if (!text) return null;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('oanda-readonly-stream-json-invalid');
  }
  return parseStreamObject(value, { environment, receivedTimestampMs });
}

async function* readBodyChunks(body) {
  if (!body) throw new Error('oanda-readonly-stream-body-missing');
  if (typeof body.getReader === 'function') {
    const reader = body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield value;
      }
    } finally {
      if (typeof reader.releaseLock === 'function') reader.releaseLock();
    }
    return;
  }
  if (body[Symbol.asyncIterator]) {
    for await (const chunk of body) yield chunk;
    return;
  }
  throw new Error('oanda-readonly-stream-body-unsupported');
}

export function createOandaV20ReadonlyClient({
  environment = 'practice',
  accountId,
  token,
  fetchImpl = globalThis.fetch,
  now = Date.now,
} = {}) {
  const account = accountPathId(accountId);
  const secret = nonEmpty(token, 'token');
  if (typeof fetchImpl !== 'function') throw new Error('oanda-readonly-fetch-required');
  if (typeof now !== 'function') throw new Error('oanda-readonly-clock-required');
  const bases = environmentBases(environment);
  const pricingPath = `/v3/accounts/${account}/pricing`;
  const streamPath = `/v3/accounts/${account}/pricing/stream`;
  assertOandaReadonlyTarget({ method:'GET', path:pricingPath });
  assertOandaReadonlyTarget({ method:'GET', path:streamPath });

  const metadata = Object.freeze({
    schemaVersion:SHORT_HORIZON_OANDA_READONLY_VERSION,
    providerId:OANDA_JAPAN_NY_PRO_REST_V1.providerId,
    environment,
    providerInstrument:ALLOWED_INSTRUMENT,
    accountIdPresent:true,
    accountIdExposed:false,
    credentialMode:'IN_MEMORY_BEARER_TOKEN',
    tokenStoredOnMetadata:false,
    readOnly:true,
    allowedMethods:['GET'],
    allowedSurfaces:['CURRENT_PRICING','PRICING_STREAM'],
    orderSurfaceAvailable:false,
    executionAuthorized:false,
    realMoneyRouting:false,
    orderSubmission:false,
  });

  async function fetchCurrentUsdJpyQuote() {
    const url = buildUrl(bases.rest, pricingPath, { instruments:ALLOWED_INSTRUMENT });
    const response = await fetchImpl(url, {
      method:'GET',
      headers:bearerHeaders(secret),
    });
    const payload = await safeJson(response);
    return buildOandaExecutableQuoteFromClientPrice({
      clientPrice:findUsdJpyPrice(payload),
      environment,
      receivedTimestampMs:Number(now()),
      transport:'REST_CURRENT_PRICING',
      providerId:OANDA_JAPAN_NY_PRO_REST_V1.providerId,
    });
  }

  function pricingStreamUrl() {
    return buildUrl(bases.stream, streamPath, { instruments:ALLOWED_INSTRUMENT, snapshot:true });
  }

  async function streamUsdJpyPrices({ onQuote, onHeartbeat, signal } = {}) {
    if (onQuote !== undefined && typeof onQuote !== 'function') throw new Error('oanda-readonly-on-quote-invalid');
    if (onHeartbeat !== undefined && typeof onHeartbeat !== 'function') throw new Error('oanda-readonly-on-heartbeat-invalid');
    const url = pricingStreamUrl();
    const response = await fetchImpl(url, {
      method:'GET',
      headers:bearerHeaders(secret),
      signal,
    });
    if (!response?.ok) {
      const status = Number(response?.status);
      throw new Error(`oanda-readonly-http-${Number.isFinite(status) ? status : 'error'}`);
    }
    const decoder = new TextDecoder();
    let buffer = '';
    let quoteCount = 0;
    let heartbeatCount = 0;

    const consumeLine = async (line) => {
      const event = parseOandaPricingStreamLine(line, { environment, receivedTimestampMs:Number(now()) });
      if (!event) return;
      if (event.type === 'QUOTE') {
        quoteCount += 1;
        if (onQuote) await onQuote(event.quote);
      } else if (event.type === 'HEARTBEAT') {
        heartbeatCount += 1;
        if (onHeartbeat) await onHeartbeat(event);
      }
    };

    for await (const chunk of readBodyChunks(response.body)) {
      buffer += decoder.decode(chunk, { stream:true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) await consumeLine(line);
    }
    buffer += decoder.decode();
    if (buffer.trim()) await consumeLine(buffer);

    return {
      status:'STREAM_ENDED',
      environment,
      providerInstrument:ALLOWED_INSTRUMENT,
      quoteCount,
      heartbeatCount,
      executionAuthorized:false,
      orderSubmission:false,
    };
  }

  return Object.freeze({
    metadata,
    fetchCurrentUsdJpyQuote,
    pricingStreamUrl,
    streamUsdJpyPrices,
  });
}
