export const GMO_FX_PUBLIC_QUOTE_VERSION = 'gmo-fx-public-quote-v1';
export const GMO_FX_PUBLIC_PROVIDER_ID = 'gmo-coin-fx-public-v1';
export const GMO_FX_PUBLIC_WS_URL = 'wss://forex-api.coin.z.com/ws/public/v1';

const round = (value, digits = 8) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

export function buildGmoFxTickerSubscription(symbol = 'USD_JPY') {
  if (symbol !== 'USD_JPY') throw new Error('gmo-fx-public-symbol-unsupported');
  return { command:'subscribe', channel:'ticker', symbol };
}

export function buildGmoFxPublicQuote(payload, { receivedTimestampMs = Date.now() } = {}) {
  if (!payload || typeof payload !== 'object') throw new Error('gmo-fx-public-payload-required');
  if (payload.symbol !== 'USD_JPY') throw new Error('gmo-fx-public-symbol-unsupported');
  if (!['OPEN','CLOSE'].includes(payload.status)) throw new Error('gmo-fx-public-status-invalid');
  const bid = Number(payload.bid);
  const ask = Number(payload.ask);
  if (!(bid > 0) || !(ask >= bid)) throw new Error('gmo-fx-public-spread-invalid');
  const sourceTimestampMs = Date.parse(String(payload.timestamp || ''));
  if (!Number.isFinite(sourceTimestampMs)) throw new Error('gmo-fx-public-source-time-invalid');
  const received = Number(receivedTimestampMs);
  if (!Number.isFinite(received) || received < 0) throw new Error('gmo-fx-public-received-time-invalid');
  const mid = (bid + ask) / 2;
  const spreadPriceUnits = ask - bid;
  const spreadBps = spreadPriceUnits / mid * 10_000;

  const record = {
    schemaVersion:GMO_FX_PUBLIC_QUOTE_VERSION,
    quoteId:[GMO_FX_PUBLIC_PROVIDER_ID, 'USD_JPY', sourceTimestampMs].join('|'),
    provider:{
      providerId:GMO_FX_PUBLIC_PROVIDER_ID,
      providerInstrument:'USD_JPY',
      transport:'PUBLIC_WEBSOCKET_TICKER',
      endpoint:GMO_FX_PUBLIC_WS_URL,
      authenticationRequired:false,
      accountSpecificPricing:false,
      publicVenueQuote:true,
    },
    timing:{
      sourceTimestampMs,
      receivedTimestampMs:received,
      receiveMinusSourceMs:round(received - sourceTimestampMs, 3),
      sourceTimeIso:new Date(sourceTimestampMs).toISOString(),
    },
    quote:{
      marketStatus:payload.status,
      tradeableProxy:payload.status === 'OPEN',
      bid:round(bid, 8),
      ask:round(ask, 8),
      mid:round(mid, 8),
      spreadPriceUnits:round(spreadPriceUnits, 8),
      spreadBps:round(spreadBps, 6),
    },
    observation:{
      providerQuoteObserved:true,
      accountSpecificQuoteObserved:false,
      fillObserved:false,
      slippageObserved:false,
      roundTripFeeObserved:false,
      financingOrSwapObserved:false,
      actualNetEvAvailable:false,
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
  validateGmoFxPublicQuote(record);
  return record;
}

export function validateGmoFxPublicQuote(record) {
  if (!record || record.schemaVersion !== GMO_FX_PUBLIC_QUOTE_VERSION) throw new Error('gmo-fx-public-version-invalid');
  if (!record.quoteId || record.provider?.providerId !== GMO_FX_PUBLIC_PROVIDER_ID) throw new Error('gmo-fx-public-provider-invalid');
  if (record.provider?.providerInstrument !== 'USD_JPY' || record.provider?.authenticationRequired !== false || record.provider?.accountSpecificPricing !== false) {
    throw new Error('gmo-fx-public-provider-contract-invalid');
  }
  const bid = Number(record.quote?.bid);
  const ask = Number(record.quote?.ask);
  const spreadBps = Number(record.quote?.spreadBps);
  if (!(bid > 0) || !(ask >= bid) || !(spreadBps >= 0)) throw new Error('gmo-fx-public-price-invalid');
  if (!['OPEN','CLOSE'].includes(record.quote?.marketStatus)) throw new Error('gmo-fx-public-market-status-invalid');
  if (record.observation?.providerQuoteObserved !== true || record.observation?.accountSpecificQuoteObserved !== false) throw new Error('gmo-fx-public-observation-invalid');
  if (
    record.observation?.fillObserved !== false ||
    record.observation?.slippageObserved !== false ||
    record.observation?.roundTripFeeObserved !== false ||
    record.observation?.financingOrSwapObserved !== false ||
    record.observation?.actualNetEvAvailable !== false
  ) throw new Error('gmo-fx-public-execution-claim-invalid');
  if (
    record.governance?.readOnlyObservation !== true ||
    record.governance?.usedByDecisionEngine !== false ||
    record.governance?.automaticPromotion !== false ||
    record.governance?.executionAuthorized !== false ||
    record.governance?.realMoneyRouting !== false ||
    record.governance?.orderSubmission !== false ||
    record.governance?.profitabilityClaim !== false
  ) throw new Error('gmo-fx-public-governance-invalid');
  return true;
}
