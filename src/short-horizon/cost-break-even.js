import { validateShortHorizonOutcomeRecord } from './outcome-contract.js';

export const SHORT_HORIZON_COST_BREAK_EVEN_VERSION = 'short-horizon-cost-break-even-v1';

const round = (value, digits = 6) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

export function buildShortHorizonCostBreakEvenRecord(outcomeRecord, {
  outcomeRecordSha256 = null,
  analyzedAtMs = Date.now(),
} = {}) {
  validateShortHorizonOutcomeRecord(outcomeRecord);
  const signal = outcomeRecord.decision.signal;
  const directional = signal === 'LONG' || signal === 'SHORT';
  const rawDirectionalReturnPct = directional ? Number(outcomeRecord.result.rawDirectionalReturnPct) : null;
  if (directional && !Number.isFinite(rawDirectionalReturnPct)) {
    throw new Error('short-horizon-cost-break-even-directional-return-missing');
  }

  const grossDirectionalReturnBps = directional ? rawDirectionalReturnPct * 100 : null;
  const positiveCostBudgetExists = directional ? grossDirectionalReturnBps > 0 : false;
  const breakEvenRoundTripCostBps = directional ? Math.max(0, grossDirectionalReturnBps) : null;

  const record = {
    schemaVersion:SHORT_HORIZON_COST_BREAK_EVEN_VERSION,
    analysisId:`${outcomeRecord.outcomeId}|cost-break-even-v1`,
    outcomeId:outcomeRecord.outcomeId,
    signalId:outcomeRecord.signalId,
    analyzedAtMs:Number(analyzedAtMs),
    market:{
      assetClass:outcomeRecord.market.assetClass,
      instrument:outcomeRecord.market.instrument,
      venue:outcomeRecord.market.venue,
      timeframeMinutes:Number(outcomeRecord.market.timeframeMinutes),
    },
    horizon:{
      kind:outcomeRecord.horizonKind,
      minutes:Number(outcomeRecord.horizonMinutes),
      targetCloseTimestampMs:Number(outcomeRecord.targetCloseTimestampMs),
    },
    context:{
      signal,
      primarySession:outcomeRecord.decision.primarySession || null,
      regime:outcomeRecord.decision.regime || null,
      riskGate:outcomeRecord.decision.riskGate || null,
    },
    gross:{
      directionalTrade:directional,
      rawDirectionalReturnPct:rawDirectionalReturnPct == null ? null : round(rawDirectionalReturnPct),
      grossDirectionalReturnBps:grossDirectionalReturnBps == null ? null : round(grossDirectionalReturnBps),
      rawOutcomeClass:outcomeRecord.result.rawOutcomeClass,
    },
    costEnvelope:{
      costBindingStatus:'UNBOUND',
      actualRoundTripCostBps:null,
      breakEvenRoundTripCostBps:breakEvenRoundTripCostBps == null ? null : round(breakEvenRoundTripCostBps),
      positiveCostBudgetExists,
      strictPositiveNetRequiresActualCostBelowBreakEven:positiveCostBudgetExists,
      netReturnAvailable:false,
      netReturnPct:null,
      transactionCostsModeled:false,
      providerCostClaim:false,
    },
    provenance:{
      outcomeRecordSha256:outcomeRecordSha256 || null,
      sourceOutcomeSchemaVersion:outcomeRecord.schemaVersion,
      sourceOutcomeEvaluatorVersion:outcomeRecord.provenance?.evaluatorVersion || null,
    },
    governance:{
      descriptiveOnly:true,
      optimizer:false,
      changesHumanCanonThresholds:false,
      usedByDecisionEngine:false,
      automaticPromotion:false,
      executionAuthorized:false,
      realMoneyRouting:false,
      orderSubmission:false,
      profitabilityClaim:false,
    },
  };
  validateShortHorizonCostBreakEvenRecord(record);
  return record;
}

export function validateShortHorizonCostBreakEvenRecord(record) {
  if (!record || record.schemaVersion !== SHORT_HORIZON_COST_BREAK_EVEN_VERSION) {
    throw new Error('short-horizon-cost-break-even-version-invalid');
  }
  if (!record.analysisId || !record.outcomeId || !record.signalId) throw new Error('short-horizon-cost-break-even-id-missing');
  if (!['LONG','SHORT','WAIT'].includes(record.context?.signal)) throw new Error('short-horizon-cost-break-even-signal-invalid');
  if (record.costEnvelope?.costBindingStatus !== 'UNBOUND') throw new Error('short-horizon-cost-break-even-binding-must-be-unbound');
  if (record.costEnvelope?.actualRoundTripCostBps !== null) throw new Error('short-horizon-cost-break-even-actual-cost-claim-forbidden');
  if (record.costEnvelope?.netReturnAvailable !== false || record.costEnvelope?.netReturnPct !== null) {
    throw new Error('short-horizon-cost-break-even-net-return-claim-forbidden');
  }
  if (record.costEnvelope?.transactionCostsModeled !== false || record.costEnvelope?.providerCostClaim !== false) {
    throw new Error('short-horizon-cost-break-even-cost-model-claim-forbidden');
  }
  const directional = record.gross?.directionalTrade === true;
  if (directional) {
    const grossBps = Number(record.gross.grossDirectionalReturnBps);
    const breakEven = Number(record.costEnvelope.breakEvenRoundTripCostBps);
    if (!Number.isFinite(grossBps) || !Number.isFinite(breakEven)) throw new Error('short-horizon-cost-break-even-directional-values-invalid');
    if (breakEven !== Math.max(0, grossBps)) throw new Error('short-horizon-cost-break-even-threshold-invalid');
    if (record.costEnvelope.positiveCostBudgetExists !== (grossBps > 0)) throw new Error('short-horizon-cost-break-even-budget-flag-invalid');
  } else {
    if (record.context.signal !== 'WAIT') throw new Error('short-horizon-cost-break-even-nondirectional-signal-invalid');
    if (record.gross.rawDirectionalReturnPct !== null || record.gross.grossDirectionalReturnBps !== null) {
      throw new Error('short-horizon-cost-break-even-wait-directional-return-forbidden');
    }
    if (record.costEnvelope.breakEvenRoundTripCostBps !== null || record.costEnvelope.positiveCostBudgetExists !== false) {
      throw new Error('short-horizon-cost-break-even-wait-budget-forbidden');
    }
  }
  if (
    record.governance?.optimizer !== false ||
    record.governance?.changesHumanCanonThresholds !== false ||
    record.governance?.usedByDecisionEngine !== false ||
    record.governance?.automaticPromotion !== false ||
    record.governance?.executionAuthorized !== false ||
    record.governance?.realMoneyRouting !== false ||
    record.governance?.orderSubmission !== false ||
    record.governance?.profitabilityClaim !== false
  ) throw new Error('short-horizon-cost-break-even-governance-invalid');
  return true;
}
