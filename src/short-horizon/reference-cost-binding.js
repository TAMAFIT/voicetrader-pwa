import { validateShortHorizonOutcomeRecord } from './outcome-contract.js';
import { validateShortHorizonCostBreakEvenRecord } from './cost-break-even.js';
import {
  OANDA_JAPAN_NY_PRO_REST_V1,
  validateShortHorizonDeployabilityProvider,
} from './deployability-registry.js';

export const SHORT_HORIZON_REFERENCE_COST_ASSESSMENT_VERSION = 'short-horizon-reference-cost-assessment-v1';

const round = (value, digits = 6) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
};

export function buildShortHorizonReferenceCostAssessment({
  costAnalysisRecord,
  outcomeRecord,
  providerProfile = OANDA_JAPAN_NY_PRO_REST_V1,
  assessedAtMs = Date.now(),
  costAnalysisRecordSha256 = null,
  outcomeRecordSha256 = null,
} = {}) {
  validateShortHorizonCostBreakEvenRecord(costAnalysisRecord);
  validateShortHorizonOutcomeRecord(outcomeRecord);
  validateShortHorizonDeployabilityProvider(providerProfile);
  if (costAnalysisRecord.outcomeId !== outcomeRecord.outcomeId) throw new Error('short-horizon-reference-cost-outcome-mismatch');
  if (costAnalysisRecord.market.assetClass !== providerProfile.product.assetClass) throw new Error('short-horizon-reference-cost-asset-class-mismatch');
  if (costAnalysisRecord.market.instrument !== providerProfile.product.researchInstrument) throw new Error('short-horizon-reference-cost-instrument-mismatch');

  const referencePrice = Number(outcomeRecord.market.entryPrice);
  if (!(referencePrice > 0)) throw new Error('short-horizon-reference-cost-price-invalid');
  const publishedSpreadPriceUnits = Number(providerProfile.product.publishedSpread.priceUnits);
  const publishedReferenceSpreadCostBps = publishedSpreadPriceUnits / referencePrice * 10_000;
  const directional = costAnalysisRecord.gross.directionalTrade === true;
  const breakEvenRoundTripCostBps = directional
    ? Number(costAnalysisRecord.costEnvelope.breakEvenRoundTripCostBps)
    : null;
  if (directional && !Number.isFinite(breakEvenRoundTripCostBps)) throw new Error('short-horizon-reference-cost-break-even-invalid');

  const spreadOnlyWithinBreakEven = directional
    ? publishedReferenceSpreadCostBps < breakEvenRoundTripCostBps
    : null;
  const marginToBreakEvenAfterPublishedSpreadBps = directional
    ? breakEvenRoundTripCostBps - publishedReferenceSpreadCostBps
    : null;

  const record = {
    schemaVersion:SHORT_HORIZON_REFERENCE_COST_ASSESSMENT_VERSION,
    assessmentId:`${costAnalysisRecord.analysisId}|${providerProfile.providerId}|published-reference-v1`,
    analysisId:costAnalysisRecord.analysisId,
    outcomeId:outcomeRecord.outcomeId,
    signalId:outcomeRecord.signalId,
    assessedAtMs:Number(assessedAtMs),
    provider:{
      providerId:providerProfile.providerId,
      legalName:providerProfile.provider.legalName,
      country:providerProfile.provider.country,
      registrationStatus:providerProfile.provider.registration.status,
      registrationNumber:providerProfile.provider.registration.registrationNumber,
      providerInstrument:providerProfile.product.providerInstrument,
      providerOrderSubmissionSupported:providerProfile.api.providerOrderSubmissionSupported,
      pricingStreamSupported:providerProfile.api.pricingStreamSupported,
      pricingStreamMaximumPricesPerSecondPerInstrumentReference:providerProfile.api.pricingStreamMaximumPricesPerSecondPerInstrumentReference,
    },
    market:{
      assetClass:costAnalysisRecord.market.assetClass,
      researchInstrument:costAnalysisRecord.market.instrument,
      researchVenue:costAnalysisRecord.market.venue,
      timeframeMinutes:Number(costAnalysisRecord.market.timeframeMinutes),
      referencePrice:round(referencePrice, 8),
      referencePriceSource:'prospective-outcome-frozen-entry-close',
      executionVenuePriceObserved:false,
      sourceMarketMatchesExecutionVenue:false,
    },
    horizon:{
      kind:costAnalysisRecord.horizon.kind,
      minutes:Number(costAnalysisRecord.horizon.minutes),
      targetCloseTimestampMs:Number(costAnalysisRecord.horizon.targetCloseTimestampMs),
    },
    context:{
      signal:costAnalysisRecord.context.signal,
      primarySession:costAnalysisRecord.context.primarySession || null,
      regime:costAnalysisRecord.context.regime || null,
      riskGate:costAnalysisRecord.context.riskGate || null,
    },
    publishedReferenceCost:{
      bindingStatus:'PUBLISHED_REFERENCE_ONLY',
      publishedSpreadSen:Number(providerProfile.product.publishedSpread.valueSen),
      publishedSpreadPriceUnits:round(publishedSpreadPriceUnits, 8),
      publishedReferenceSpreadCostBps:round(publishedReferenceSpreadCostBps),
      spreadReferenceMode:'published-static-single-spread-equivalent',
      fixedInPrinciple:providerProfile.product.publishedSpread.fixedInPrinciple,
      exceptionsApply:providerProfile.product.publishedSpread.exceptionsApply,
      actualSpreadObserved:false,
      actualRoundTripCostBps:null,
      slippageModeled:false,
      financingOrSwapModeled:false,
      executionFillModeled:false,
      quoteVenueMismatch:true,
      netReturnAvailable:false,
      netReturnPct:null,
    },
    breakEvenComparison:{
      directionalTrade:directional,
      grossDirectionalReturnBps:directional ? Number(costAnalysisRecord.gross.grossDirectionalReturnBps) : null,
      breakEvenRoundTripCostBps:directional ? round(breakEvenRoundTripCostBps) : null,
      publishedSpreadOnlyWithinBreakEven:spreadOnlyWithinBreakEven,
      marginToBreakEvenAfterPublishedSpreadBps:round(marginToBreakEvenAfterPublishedSpreadBps),
      comparisonIsDeployableNetEv:false,
    },
    deployability:{
      providerRegulatoryReference:'VERIFIED_OFFICIAL_PUBLIC_EVIDENCE',
      providerApiReference:'VERIFIED_OFFICIAL_PUBLIC_EVIDENCE',
      providerProductReference:'VERIFIED_OFFICIAL_PUBLIC_EVIDENCE',
      operatorAccountEligibility:providerProfile.eligibility.operatorEligibilityStatus,
      accountOwnershipVerified:false,
      apiEligibilityVerified:false,
      executableQuoteObserved:false,
      practiceApiUsability:'UNVERIFIED_ACCOUNT_ELIGIBILITY_REQUIRED',
      liveApiUsability:'UNVERIFIED_ACCOUNT_ELIGIBILITY_REQUIRED',
      readinessStatus:'REFERENCE_READY_OPERATOR_ELIGIBILITY_UNVERIFIED',
    },
    provenance:{
      providerEvidenceVerifiedAt:providerProfile.evidence.verifiedAt,
      providerEvidenceReferences:[...providerProfile.evidence.references],
      costAnalysisRecordSha256:costAnalysisRecordSha256 || null,
      outcomeRecordSha256:outcomeRecordSha256 || null,
    },
    governance:{
      descriptiveOnly:true,
      referenceOnly:true,
      providerConnectionAttempted:false,
      secretRequiredForThisAssessment:false,
      credentialsPresent:false,
      actualProviderCostBinding:false,
      usedByDecisionEngine:false,
      changesHumanCanonThresholds:false,
      automaticPromotion:false,
      executionAuthorized:false,
      realMoneyRouting:false,
      orderSubmission:false,
      profitabilityClaim:false,
    },
  };
  validateShortHorizonReferenceCostAssessment(record);
  return record;
}

export function validateShortHorizonReferenceCostAssessment(record) {
  if (!record || record.schemaVersion !== SHORT_HORIZON_REFERENCE_COST_ASSESSMENT_VERSION) {
    throw new Error('short-horizon-reference-cost-version-invalid');
  }
  if (!record.assessmentId || !record.analysisId || !record.outcomeId || !record.signalId) {
    throw new Error('short-horizon-reference-cost-id-invalid');
  }
  if (record.provider?.providerId !== OANDA_JAPAN_NY_PRO_REST_V1.providerId) throw new Error('short-horizon-reference-cost-provider-invalid');
  if (record.market?.assetClass !== 'fx' || record.market?.researchInstrument !== 'USDJPY') throw new Error('short-horizon-reference-cost-market-invalid');
  if (!(Number(record.market?.referencePrice) > 0)) throw new Error('short-horizon-reference-cost-reference-price-invalid');
  if (!(Number(record.publishedReferenceCost?.publishedReferenceSpreadCostBps) > 0)) throw new Error('short-horizon-reference-cost-spread-bps-invalid');
  if (record.publishedReferenceCost?.bindingStatus !== 'PUBLISHED_REFERENCE_ONLY') throw new Error('short-horizon-reference-cost-binding-status-invalid');
  if (
    record.publishedReferenceCost?.actualSpreadObserved !== false ||
    record.publishedReferenceCost?.actualRoundTripCostBps !== null ||
    record.publishedReferenceCost?.slippageModeled !== false ||
    record.publishedReferenceCost?.financingOrSwapModeled !== false ||
    record.publishedReferenceCost?.executionFillModeled !== false ||
    record.publishedReferenceCost?.quoteVenueMismatch !== true ||
    record.publishedReferenceCost?.netReturnAvailable !== false ||
    record.publishedReferenceCost?.netReturnPct !== null
  ) throw new Error('short-horizon-reference-cost-actual-cost-claim-invalid');
  const directional = record.breakEvenComparison?.directionalTrade === true;
  if (!directional) {
    if (record.context?.signal !== 'WAIT') throw new Error('short-horizon-reference-cost-wait-signal-invalid');
    if (
      record.breakEvenComparison?.grossDirectionalReturnBps !== null ||
      record.breakEvenComparison?.breakEvenRoundTripCostBps !== null ||
      record.breakEvenComparison?.publishedSpreadOnlyWithinBreakEven !== null ||
      record.breakEvenComparison?.marginToBreakEvenAfterPublishedSpreadBps !== null
    ) throw new Error('short-horizon-reference-cost-wait-comparison-invalid');
  }
  if (
    record.deployability?.operatorAccountEligibility !== 'UNVERIFIED' ||
    record.deployability?.accountOwnershipVerified !== false ||
    record.deployability?.apiEligibilityVerified !== false ||
    record.deployability?.executableQuoteObserved !== false
  ) throw new Error('short-horizon-reference-cost-eligibility-claim-invalid');
  if (
    record.governance?.descriptiveOnly !== true ||
    record.governance?.referenceOnly !== true ||
    record.governance?.providerConnectionAttempted !== false ||
    record.governance?.secretRequiredForThisAssessment !== false ||
    record.governance?.credentialsPresent !== false ||
    record.governance?.actualProviderCostBinding !== false ||
    record.governance?.usedByDecisionEngine !== false ||
    record.governance?.changesHumanCanonThresholds !== false ||
    record.governance?.automaticPromotion !== false ||
    record.governance?.executionAuthorized !== false ||
    record.governance?.realMoneyRouting !== false ||
    record.governance?.orderSubmission !== false ||
    record.governance?.profitabilityClaim !== false
  ) throw new Error('short-horizon-reference-cost-governance-invalid');
  return true;
}
