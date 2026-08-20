import { validateShortHorizonSignalRecord } from './signal-contract.js';
import { validateGmoFxPublicQuote } from './gmo-fx-public-quote.js';

export const GMO_FX_PAPER_EXECUTION_VERSION = 'gmo-fx-paper-execution-v1';
const round = (value, digits = 6) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

export function paperIdForSignal(signal, horizonKind, horizonMinutes) {
  return [GMO_FX_PAPER_EXECUTION_VERSION, signal.signalId, horizonKind, `${horizonMinutes}m`].join('|');
}

export function buildGmoFxPaperExecution({
  signal,
  horizonKind = 'primary',
  horizonMinutes,
  entryQuote = null,
  exitQuote = null,
  evaluatedAtMs = Date.now(),
} = {}) {
  validateShortHorizonSignalRecord(signal);
  if (signal.observationMode !== 'prospective' || signal.observedProspectively !== true) throw new Error('gmo-paper-prospective-signal-required');
  if (signal.market?.assetClass !== 'fx' || signal.market?.instrument !== 'USDJPY') throw new Error('gmo-paper-usdjpy-only');
  if (!['primary','secondary'].includes(horizonKind)) throw new Error('gmo-paper-horizon-kind-invalid');
  const minutes = Number(horizonMinutes);
  if (!(minutes > 0)) throw new Error('gmo-paper-horizon-invalid');
  const decision = signal.decision.signal;
  const common = {
    schemaVersion:GMO_FX_PAPER_EXECUTION_VERSION,
    paperId:paperIdForSignal(signal, horizonKind, minutes),
    signalId:signal.signalId,
    evaluatedAtMs:Number(evaluatedAtMs),
    horizon:{ kind:horizonKind, minutes },
    signal:{ decision, generatedAtMs:Number(signal.generatedAtMs), decisionBarCloseTimestampMs:Number(signal.decisionBarCloseTimestampMs) },
    researchMarket:{ venue:signal.market.venue, close:Number(signal.market.close), timeframeMinutes:Number(signal.market.timeframeMinutes) },
    executionProxy:{ providerId:'gmo-coin-fx-public-v1', providerInstrument:'USD_JPY', publicVenueQuote:true, accountSpecificPricing:false, observedFill:false },
  };

  if (decision === 'WAIT') {
    const record = {
      ...common,
      status:'NO_TRADE',
      entry:null,
      exit:null,
      result:{ quotedRoundTripReturnBps:null, quotedSpreadEmbedded:false, feesModeled:false, slippageModeled:false, financingOrSwapModeled:false, actualNetEvAvailable:false },
      governance:{ paperOnly:true, usedByDecisionEngine:false, automaticPromotion:false, executionAuthorized:false, realMoneyRouting:false, orderSubmission:false, profitabilityClaim:false },
    };
    validateGmoFxPaperExecution(record);
    return record;
  }

  if (!['LONG','SHORT'].includes(decision)) throw new Error('gmo-paper-signal-invalid');
  validateGmoFxPublicQuote(entryQuote);
  validateGmoFxPublicQuote(exitQuote);
  if (entryQuote.quote.marketStatus !== 'OPEN' || exitQuote.quote.marketStatus !== 'OPEN') throw new Error('gmo-paper-open-quote-required');
  const entrySourceMs = Number(entryQuote.timing.sourceTimestampMs);
  const exitSourceMs = Number(exitQuote.timing.sourceTimestampMs);
  const targetExitTimestampMs = entrySourceMs + minutes * 60_000;
  if (entrySourceMs < Number(signal.generatedAtMs)) throw new Error('gmo-paper-entry-before-signal');
  if (exitSourceMs < targetExitTimestampMs) throw new Error('gmo-paper-exit-before-target');
  const entryPrice = decision === 'LONG' ? Number(entryQuote.quote.ask) : Number(entryQuote.quote.bid);
  const exitPrice = decision === 'LONG' ? Number(exitQuote.quote.bid) : Number(exitQuote.quote.ask);
  const quotedRoundTripReturnBps = decision === 'LONG'
    ? (exitPrice / entryPrice - 1) * 10_000
    : (entryPrice / exitPrice - 1) * 10_000;

  const record = {
    ...common,
    status:'SIMULATED_EXECUTED',
    entry:{
      quoteId:entryQuote.quoteId,
      sourceTimestampMs:entrySourceMs,
      receivedTimestampMs:Number(entryQuote.timing.receivedTimestampMs),
      delayFromSignalGeneratedMs:entrySourceMs - Number(signal.generatedAtMs),
      side:decision === 'LONG' ? 'BUY_AT_ASK' : 'SELL_AT_BID',
      price:round(entryPrice, 8),
      bid:entryQuote.quote.bid,
      ask:entryQuote.quote.ask,
      spreadBps:entryQuote.quote.spreadBps,
    },
    exit:{
      quoteId:exitQuote.quoteId,
      sourceTimestampMs:exitSourceMs,
      receivedTimestampMs:Number(exitQuote.timing.receivedTimestampMs),
      targetExitTimestampMs,
      delayFromTargetMs:exitSourceMs - targetExitTimestampMs,
      side:decision === 'LONG' ? 'SELL_AT_BID' : 'BUY_AT_ASK',
      price:round(exitPrice, 8),
      bid:exitQuote.quote.bid,
      ask:exitQuote.quote.ask,
      spreadBps:exitQuote.quote.spreadBps,
    },
    result:{
      quotedRoundTripReturnBps:round(quotedRoundTripReturnBps),
      positiveAfterObservedQuotedSpreadOnly:quotedRoundTripReturnBps > 0,
      quotedSpreadEmbedded:true,
      feesModeled:false,
      slippageModeled:false,
      financingOrSwapModeled:false,
      actualNetEvAvailable:false,
    },
    governance:{ paperOnly:true, usedByDecisionEngine:false, automaticPromotion:false, executionAuthorized:false, realMoneyRouting:false, orderSubmission:false, profitabilityClaim:false },
  };
  validateGmoFxPaperExecution(record);
  return record;
}

export function validateGmoFxPaperExecution(record) {
  if (!record || record.schemaVersion !== GMO_FX_PAPER_EXECUTION_VERSION || !record.paperId || !record.signalId) throw new Error('gmo-paper-contract-invalid');
  if (!['LONG','SHORT','WAIT'].includes(record.signal?.decision)) throw new Error('gmo-paper-signal-invalid');
  if (record.executionProxy?.providerId !== 'gmo-coin-fx-public-v1' || record.executionProxy?.accountSpecificPricing !== false || record.executionProxy?.observedFill !== false) throw new Error('gmo-paper-proxy-invalid');
  if (record.signal.decision === 'WAIT') {
    if (record.status !== 'NO_TRADE' || record.entry !== null || record.exit !== null || record.result?.quotedRoundTripReturnBps !== null) throw new Error('gmo-paper-wait-invalid');
  } else {
    if (record.status !== 'SIMULATED_EXECUTED' || !record.entry?.quoteId || !record.exit?.quoteId || !Number.isFinite(Number(record.result?.quotedRoundTripReturnBps))) throw new Error('gmo-paper-directional-invalid');
    if (record.result?.quotedSpreadEmbedded !== true) throw new Error('gmo-paper-spread-not-embedded');
  }
  if (record.result?.feesModeled !== false || record.result?.slippageModeled !== false || record.result?.financingOrSwapModeled !== false || record.result?.actualNetEvAvailable !== false) throw new Error('gmo-paper-cost-claim-invalid');
  if (record.governance?.paperOnly !== true || record.governance?.usedByDecisionEngine !== false || record.governance?.automaticPromotion !== false || record.governance?.executionAuthorized !== false || record.governance?.realMoneyRouting !== false || record.governance?.orderSubmission !== false || record.governance?.profitabilityClaim !== false) throw new Error('gmo-paper-governance-invalid');
  return true;
}
