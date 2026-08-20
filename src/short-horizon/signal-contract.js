import { SHORT_HORIZON_HUMAN_CANON_ENGINE_VERSION } from './human-canon-engine.js';

export const SHORT_HORIZON_SIGNAL_VERSION = 'short-horizon-signal-v1';

const clone = (value) => JSON.parse(JSON.stringify(value));

export function buildShortHorizonSignalRecord({
  analysis,
  latestMarketEvent,
  generatedAtMs = Date.now(),
  observationMode = 'historical-replay',
  dataManifestSha256 = null,
} = {}) {
  if (!analysis || analysis.engineVersion !== SHORT_HORIZON_HUMAN_CANON_ENGINE_VERSION) {
    throw new Error('short-horizon-signal-analysis-invalid');
  }
  if (!latestMarketEvent || typeof latestMarketEvent !== 'object') throw new Error('short-horizon-signal-market-event-required');
  const prospective = observationMode === 'prospective';
  if (!prospective && observationMode !== 'historical-replay') throw new Error('short-horizon-signal-observation-mode-invalid');

  const sourceTimestampMs = Number(latestMarketEvent.sourceTimestampMs);
  const timeframeMinutes = Number(latestMarketEvent.timeframeMinutes);
  const decisionBarCloseTimestampMs = sourceTimestampMs + timeframeMinutes * 60_000;
  const generated = Number(generatedAtMs);
  if (!Number.isFinite(generated)) throw new Error('short-horizon-signal-generated-at-invalid');
  if (prospective && generated < decisionBarCloseTimestampMs) throw new Error('short-horizon-prospective-before-bar-close');

  const signalId = [
    SHORT_HORIZON_SIGNAL_VERSION,
    analysis.engineVersion,
    latestMarketEvent.venue,
    latestMarketEvent.instrument,
    `${timeframeMinutes}m`,
    sourceTimestampMs,
  ].join('|');

  return {
    schemaVersion:SHORT_HORIZON_SIGNAL_VERSION,
    signalId,
    observationMode,
    observedProspectively:prospective,
    futureOutcomeUsed:false,
    generatedAtMs:generated,
    decisionBarCloseTimestampMs,
    market:{
      assetClass:latestMarketEvent.assetClass,
      instrument:latestMarketEvent.instrument,
      venue:latestMarketEvent.venue,
      timeframeMinutes,
      sourceTimestampMs,
      sourceReceivedTimestampMs:Number(latestMarketEvent.receivedTimestampMs),
      close:Number(latestMarketEvent.close),
      sourceId:latestMarketEvent.sourceId,
      sourceEventId:analysis.sourceEventId,
    },
    decision:{
      signal:analysis.signal,
      intendedHorizonMinutes:analysis.intendedHorizonMinutes,
      secondaryHorizonMinutes:analysis.secondaryHorizonMinutes,
      signalStrengthScore:analysis.signalStrengthScore,
      confidenceIsCalibratedProbability:false,
      scoreIsExpectedReturn:false,
      aggregation:clone(analysis.aggregation),
      context:clone(analysis.context),
      families:clone(analysis.families),
      reasons:clone(analysis.reasons),
      features:clone(analysis.features),
    },
    provenance:{
      engineVersion:analysis.engineVersion,
      registryVersion:analysis.registryVersion,
      dataManifestSha256:dataManifestSha256 || null,
    },
    governance:{
      immutableDecisionTimeRecord:true,
      outcomeStoredSeparately:true,
      historicalReplayIsNotProspective:!prospective,
      executionAuthorized:false,
      realMoneyRouting:false,
      orderSubmission:false,
      automaticPromotion:false,
    },
  };
}

export function validateShortHorizonSignalRecord(record) {
  if (!record || record.schemaVersion !== SHORT_HORIZON_SIGNAL_VERSION) throw new Error('short-horizon-signal-version-invalid');
  if (!record.signalId) throw new Error('short-horizon-signal-id-missing');
  if (!['prospective','historical-replay'].includes(record.observationMode)) throw new Error('short-horizon-signal-mode-invalid');
  if (record.futureOutcomeUsed !== false) throw new Error('short-horizon-signal-future-outcome-flag-invalid');
  if (record.observationMode === 'prospective' && record.observedProspectively !== true) throw new Error('short-horizon-signal-prospective-flag-invalid');
  if (record.observationMode === 'historical-replay' && record.observedProspectively !== false) throw new Error('short-horizon-signal-replay-flag-invalid');
  if (!['LONG','SHORT','WAIT'].includes(record.decision?.signal)) throw new Error('short-horizon-signal-decision-invalid');
  if (record.decision?.confidenceIsCalibratedProbability !== false) throw new Error('short-horizon-signal-probability-claim-invalid');
  if (record.decision?.scoreIsExpectedReturn !== false) throw new Error('short-horizon-signal-return-claim-invalid');
  if (record.governance?.executionAuthorized !== false || record.governance?.realMoneyRouting !== false || record.governance?.orderSubmission !== false) {
    throw new Error('short-horizon-signal-execution-guardrail-open');
  }
  return true;
}
