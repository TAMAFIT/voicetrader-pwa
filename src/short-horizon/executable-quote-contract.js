export const SHORT_HORIZON_EXECUTABLE_QUOTE_VERSION = 'short-horizon-executable-quote-v1';

const finite = (value, name) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`short-horizon-executable-quote-${name}-invalid`);
  return number;
};

const nonEmpty = (value, name) => {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`short-horizon-executable-quote-${name}-invalid`);
  return text;
};

const round = (value, digits = 8) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

function bestBucket(buckets, side) {
  if (!Array.isArray(buckets) || buckets.length === 0) throw new Error(`short-horizon-executable-quote-${side}-missing`);
  const normalized = buckets.map((bucket) => ({
    price:finite(bucket?.price, `${side}-price`),
    liquidity:finite(bucket?.liquidity ?? 0, `${side}-liquidity`),
  }));
  const bestPrice = side === 'bid'
    ? Math.max(...normalized.map((item) => item.price))
    : Math.min(...normalized.map((item) => item.price));
  const atBest = normalized.filter((item) => item.price === bestPrice);
  return {
    price:bestPrice,
    liquidity:Math.max(...atBest.map((item) => item.liquidity)),
    bucketCount:normalized.length,
  };
}

export function buildOandaExecutableQuoteFromClientPrice({
  clientPrice,
  environment,
  receivedTimestampMs = Date.now(),
  transport = 'REST_CURRENT_PRICING',
  providerId = 'oanda-japan-ny-pro-rest-v1',
} = {}) {
  if (!['practice','live'].includes(environment)) throw new Error('short-horizon-executable-quote-environment-invalid');
  if (!['REST_CURRENT_PRICING','PRICING_STREAM'].includes(transport)) throw new Error('short-horizon-executable-quote-transport-invalid');
  if (!clientPrice || typeof clientPrice !== 'object') throw new Error('short-horizon-executable-quote-client-price-required');
  const instrument = nonEmpty(clientPrice.instrument, 'instrument');
  if (instrument !== 'USD_JPY') throw new Error('short-horizon-executable-quote-instrument-unsupported');
  const sourceTimestampMs = Date.parse(nonEmpty(clientPrice.time, 'source-time'));
  if (!Number.isFinite(sourceTimestampMs)) throw new Error('short-horizon-executable-quote-source-time-invalid');
  const received = finite(receivedTimestampMs, 'received-timestamp');
  if (received < 0) throw new Error('short-horizon-executable-quote-received-timestamp-negative');

  const bid = bestBucket(clientPrice.bids, 'bid');
  const ask = bestBucket(clientPrice.asks, 'ask');
  if (!(bid.price > 0) || !(ask.price > 0) || ask.price < bid.price) {
    throw new Error('short-horizon-executable-quote-spread-invalid');
  }
  const mid = (bid.price + ask.price) / 2;
  const spreadPriceUnits = ask.price - bid.price;
  const spreadBps = spreadPriceUnits / mid * 10_000;
  const tradeable = clientPrice.tradeable === true || clientPrice.status === 'tradeable';

  const record = {
    schemaVersion:SHORT_HORIZON_EXECUTABLE_QUOTE_VERSION,
    quoteId:[providerId, environment, instrument, sourceTimestampMs, transport].join('|'),
    provider:{
      providerId,
      environment,
      providerInstrument:instrument,
      accountSpecificPricing:true,
      transport,
    },
    timing:{
      sourceTimestampMs,
      receivedTimestampMs:received,
      receiveMinusSourceMs:round(received - sourceTimestampMs, 3),
      sourceTimeIso:new Date(sourceTimestampMs).toISOString(),
    },
    quote:{
      tradeable,
      bid:round(bid.price, 8),
      ask:round(ask.price, 8),
      mid:round(mid, 8),
      spreadPriceUnits:round(spreadPriceUnits, 8),
      spreadBps:round(spreadBps, 6),
      bestBidLiquidity:bid.liquidity,
      bestAskLiquidity:ask.liquidity,
      bidBucketCount:bid.bucketCount,
      askBucketCount:ask.bucketCount,
    },
    observation:{
      providerQuoteObserved:true,
      practiceQuoteObserved:environment === 'practice',
      liveAccountQuoteObserved:environment === 'live',
      liveExecutableQuoteObserved:environment === 'live' && tradeable,
      fillObserved:false,
      slippageObserved:false,
      roundTripCostObserved:false,
      financingOrSwapObserved:false,
      netReturnAvailable:false,
    },
    governance:{
      readOnlyObservation:true,
      usedByDecisionEngine:false,
      automaticPromotion:false,
      executionAuthorized:false,
      realMoneyRouting:false,
      orderSubmission:false,
      profitabilityClaim:false,
    },
  };
  validateShortHorizonExecutableQuote(record);
  return record;
}

export function validateShortHorizonExecutableQuote(record) {
  if (!record || record.schemaVersion !== SHORT_HORIZON_EXECUTABLE_QUOTE_VERSION) {
    throw new Error('short-horizon-executable-quote-version-invalid');
  }
  if (!record.quoteId || record.provider?.providerId !== 'oanda-japan-ny-pro-rest-v1') {
    throw new Error('short-horizon-executable-quote-provider-invalid');
  }
  if (!['practice','live'].includes(record.provider?.environment)) throw new Error('short-horizon-executable-quote-environment-invalid');
  if (record.provider?.providerInstrument !== 'USD_JPY') throw new Error('short-horizon-executable-quote-instrument-invalid');
  const bid = Number(record.quote?.bid);
  const ask = Number(record.quote?.ask);
  const mid = Number(record.quote?.mid);
  const spreadBps = Number(record.quote?.spreadBps);
  if (!(bid > 0) || !(ask >= bid) || !(mid > 0) || !(spreadBps >= 0)) throw new Error('short-horizon-executable-quote-price-invalid');
  if (record.observation?.providerQuoteObserved !== true || record.observation?.fillObserved !== false) {
    throw new Error('short-horizon-executable-quote-observation-invalid');
  }
  if (record.provider.environment === 'practice' && record.observation?.practiceQuoteObserved !== true) {
    throw new Error('short-horizon-executable-quote-practice-flag-invalid');
  }
  if (record.provider.environment === 'practice' && record.observation?.liveExecutableQuoteObserved !== false) {
    throw new Error('short-horizon-executable-quote-practice-live-claim-invalid');
  }
  if (
    record.observation?.slippageObserved !== false ||
    record.observation?.roundTripCostObserved !== false ||
    record.observation?.financingOrSwapObserved !== false ||
    record.observation?.netReturnAvailable !== false
  ) throw new Error('short-horizon-executable-quote-cost-claim-invalid');
  if (
    record.governance?.readOnlyObservation !== true ||
    record.governance?.usedByDecisionEngine !== false ||
    record.governance?.automaticPromotion !== false ||
    record.governance?.executionAuthorized !== false ||
    record.governance?.realMoneyRouting !== false ||
    record.governance?.orderSubmission !== false ||
    record.governance?.profitabilityClaim !== false
  ) throw new Error('short-horizon-executable-quote-governance-invalid');
  return true;
}
