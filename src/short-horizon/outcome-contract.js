import { validateMarketEvent } from './market-event.js';
import { validateShortHorizonSignalRecord } from './signal-contract.js';

export const SHORT_HORIZON_OUTCOME_VERSION = 'short-horizon-outcome-v1';
export const SHORT_HORIZON_OUTCOME_EVALUATOR_VERSION = 'short-horizon-outcome-evaluator-v1';

const round = (value, digits = 8) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

function horizonMinutesFor(signalRecord, horizonKind) {
  if (horizonKind === 'primary') return Number(signalRecord.decision?.intendedHorizonMinutes);
  if (horizonKind === 'secondary') return Number(signalRecord.decision?.secondaryHorizonMinutes);
  throw new Error('short-horizon-outcome-horizon-kind-invalid');
}

function streamMatches(event, signalRecord) {
  return event.assetClass === signalRecord.market.assetClass &&
    event.instrument === signalRecord.market.instrument &&
    event.venue === signalRecord.market.venue &&
    Number(event.timeframeMinutes) === Number(signalRecord.market.timeframeMinutes);
}

function expectedFutureSources(signalRecord, horizonMinutes) {
  const timeframeMinutes = Number(signalRecord.market.timeframeMinutes);
  if (!Number.isInteger(timeframeMinutes) || timeframeMinutes <= 0) throw new Error('short-horizon-outcome-timeframe-invalid');
  if (!Number.isInteger(horizonMinutes) || horizonMinutes <= 0 || horizonMinutes % timeframeMinutes !== 0) {
    throw new Error('short-horizon-outcome-horizon-not-aligned');
  }
  const count = horizonMinutes / timeframeMinutes;
  const firstFutureSourceTimestampMs = Number(signalRecord.decisionBarCloseTimestampMs);
  return Array.from({ length:count }, (_, index) => firstFutureSourceTimestampMs + index * timeframeMinutes * 60_000);
}

function signedExcursions(signal, entryPrice, futureEvents) {
  const maxHigh = Math.max(...futureEvents.map((event) => Number(event.high)));
  const minLow = Math.min(...futureEvents.map((event) => Number(event.low)));
  const marketMaxUpPct = Math.max(0, (maxHigh / entryPrice - 1) * 100);
  const marketMaxDownPct = Math.min(0, (minLow / entryPrice - 1) * 100);

  if (signal === 'LONG') {
    return {
      mfePct:marketMaxUpPct,
      maePct:marketMaxDownPct,
      marketMaxUpPct,
      marketMaxDownPct,
    };
  }
  if (signal === 'SHORT') {
    return {
      mfePct:Math.max(0, ((entryPrice - minLow) / entryPrice) * 100),
      maePct:Math.min(0, ((entryPrice - maxHigh) / entryPrice) * 100),
      marketMaxUpPct,
      marketMaxDownPct,
    };
  }
  return {
    mfePct:null,
    maePct:null,
    marketMaxUpPct,
    marketMaxDownPct,
  };
}

function rawOutcomeClass(signal, directionalReturnPct) {
  if (signal === 'WAIT') return 'WAIT_OBSERVATION';
  if (directionalReturnPct > 1e-12) return 'WIN';
  if (directionalReturnPct < -1e-12) return 'LOSS';
  return 'FLAT';
}

export function evaluateShortHorizonOutcome({
  signalRecord,
  events,
  horizonKind,
  observedAtMs = Date.now(),
  signalRecordSha256 = null,
  futureWindowSha256 = null,
} = {}) {
  validateShortHorizonSignalRecord(signalRecord);
  if (signalRecord.observationMode !== 'prospective' || signalRecord.observedProspectively !== true) {
    throw new Error('short-horizon-outcome-prospective-signal-required');
  }
  if (!Array.isArray(events)) throw new Error('short-horizon-outcome-events-required');
  const observed = Number(observedAtMs);
  if (!Number.isFinite(observed)) throw new Error('short-horizon-outcome-observed-at-invalid');

  const horizonMinutes = horizonMinutesFor(signalRecord, horizonKind);
  const expectedSources = expectedFutureSources(signalRecord, horizonMinutes);
  const targetCloseTimestampMs = Number(signalRecord.decisionBarCloseTimestampMs) + horizonMinutes * 60_000;
  if (observed < targetCloseTimestampMs) {
    return {
      evaluatorVersion:SHORT_HORIZON_OUTCOME_EVALUATOR_VERSION,
      status:'PENDING_TIME',
      horizonKind,
      horizonMinutes,
      targetCloseTimestampMs,
      remainingMs:targetCloseTimestampMs - observed,
      record:null,
      futureEvents:[],
      missingSourceTimestampsMs:expectedSources,
    };
  }

  const bySource = new Map();
  for (const event of events) {
    validateMarketEvent(event);
    if (!streamMatches(event, signalRecord)) continue;
    const sourceTimestampMs = Number(event.sourceTimestampMs);
    if (bySource.has(sourceTimestampMs)) throw new Error('short-horizon-outcome-duplicate-market-event');
    bySource.set(sourceTimestampMs, event);
  }

  const futureEvents = expectedSources.map((timestampMs) => bySource.get(timestampMs)).filter(Boolean);
  const missingSourceTimestampsMs = expectedSources.filter((timestampMs) => !bySource.has(timestampMs));
  if (missingSourceTimestampsMs.length) {
    return {
      evaluatorVersion:SHORT_HORIZON_OUTCOME_EVALUATOR_VERSION,
      status:'MISSING_DATA',
      horizonKind,
      horizonMinutes,
      targetCloseTimestampMs,
      remainingMs:0,
      record:null,
      futureEvents,
      missingSourceTimestampsMs,
    };
  }

  const entryPrice = Number(signalRecord.market.close);
  if (!(entryPrice > 0)) throw new Error('short-horizon-outcome-entry-price-invalid');
  const exitEvent = futureEvents.at(-1);
  const exitPrice = Number(exitEvent.close);
  if (!(exitPrice > 0)) throw new Error('short-horizon-outcome-exit-price-invalid');
  const marketReturnPct = (exitPrice / entryPrice - 1) * 100;
  const signal = signalRecord.decision.signal;
  const directionalReturnPct = signal === 'LONG'
    ? marketReturnPct
    : signal === 'SHORT'
      ? -marketReturnPct
      : null;
  const excursions = signedExcursions(signal, entryPrice, futureEvents);
  const outcomeId = `${signalRecord.signalId}|${horizonKind}|${horizonMinutes}m`;

  const record = {
    schemaVersion:SHORT_HORIZON_OUTCOME_VERSION,
    outcomeId,
    signalId:signalRecord.signalId,
    horizonKind,
    horizonMinutes,
    status:'MATURED',
    maturedAtMs:observed,
    targetCloseTimestampMs,
    signalDecisionBarCloseTimestampMs:Number(signalRecord.decisionBarCloseTimestampMs),
    market:{
      assetClass:signalRecord.market.assetClass,
      instrument:signalRecord.market.instrument,
      venue:signalRecord.market.venue,
      timeframeMinutes:Number(signalRecord.market.timeframeMinutes),
      entryPrice:round(entryPrice),
      exitPrice:round(exitPrice),
      exitSourceTimestampMs:Number(exitEvent.sourceTimestampMs),
      marketReturnPct:round(marketReturnPct),
      marketMaxUpPct:round(excursions.marketMaxUpPct),
      marketMaxDownPct:round(excursions.marketMaxDownPct),
      pathBarCount:futureEvents.length,
    },
    decision:{
      signal,
      signalStrengthScore:Number(signalRecord.decision.signalStrengthScore),
      primarySession:signalRecord.timeContext?.sessions?.primarySession || null,
      regime:signalRecord.decision.context?.regime || null,
      riskGate:signalRecord.decision.context?.riskGate || null,
    },
    result:{
      rawDirectionalReturnPct:directionalReturnPct == null ? null : round(directionalReturnPct),
      rawOutcomeClass:rawOutcomeClass(signal, directionalReturnPct),
      mfePct:excursions.mfePct == null ? null : round(excursions.mfePct),
      maePct:excursions.maePct == null ? null : round(excursions.maePct),
      transactionCostsModeled:false,
      netReturnPct:null,
      executionFillModeled:false,
    },
    provenance:{
      evaluatorVersion:SHORT_HORIZON_OUTCOME_EVALUATOR_VERSION,
      signalRecordSha256:signalRecordSha256 || null,
      futureWindowSha256:futureWindowSha256 || null,
      exactAlignedClosedBars:true,
    },
    governance:{
      mutatesSignalRecord:false,
      usedByDecisionEngine:false,
      futureOutcomeUsedForSignal:false,
      automaticPromotion:false,
      executionAuthorized:false,
      realMoneyRouting:false,
      orderSubmission:false,
      profitabilityClaim:false,
    },
  };
  validateShortHorizonOutcomeRecord(record);
  return {
    evaluatorVersion:SHORT_HORIZON_OUTCOME_EVALUATOR_VERSION,
    status:'MATURED',
    horizonKind,
    horizonMinutes,
    targetCloseTimestampMs,
    remainingMs:0,
    record,
    futureEvents,
    missingSourceTimestampsMs:[],
  };
}

export function validateShortHorizonOutcomeRecord(record) {
  if (!record || record.schemaVersion !== SHORT_HORIZON_OUTCOME_VERSION) throw new Error('short-horizon-outcome-version-invalid');
  if (!record.outcomeId || !record.signalId) throw new Error('short-horizon-outcome-id-missing');
  if (!['primary','secondary'].includes(record.horizonKind)) throw new Error('short-horizon-outcome-horizon-kind-invalid');
  if (record.status !== 'MATURED') throw new Error('short-horizon-outcome-status-invalid');
  if (!['LONG','SHORT','WAIT'].includes(record.decision?.signal)) throw new Error('short-horizon-outcome-signal-invalid');
  if (!['WIN','LOSS','FLAT','WAIT_OBSERVATION'].includes(record.result?.rawOutcomeClass)) throw new Error('short-horizon-outcome-class-invalid');
  if (record.result?.transactionCostsModeled !== false || record.result?.netReturnPct !== null) {
    throw new Error('short-horizon-outcome-cost-claim-invalid');
  }
  if (record.governance?.mutatesSignalRecord !== false || record.governance?.usedByDecisionEngine !== false) {
    throw new Error('short-horizon-outcome-decision-separation-invalid');
  }
  if (
    record.governance?.executionAuthorized !== false ||
    record.governance?.realMoneyRouting !== false ||
    record.governance?.orderSubmission !== false
  ) throw new Error('short-horizon-outcome-execution-guardrail-open');
  return true;
}
