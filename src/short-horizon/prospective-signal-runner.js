import { analyzeShortHorizonHumanCanon } from './human-canon-engine.js';
import { assessShortHorizonFreshness } from './freshness-gate.js';
import { buildShortHorizonSignalRecord, validateShortHorizonSignalRecord } from './signal-contract.js';
import { attachTimeContextToSignal, buildShortHorizonTimeContext } from './session-context.js';

export const SHORT_HORIZON_PROSPECTIVE_SIGNAL_RUNNER_VERSION = 'short-horizon-prospective-signal-runner-v1';

const clone = (value) => JSON.parse(JSON.stringify(value));

export function buildProspectiveShortHorizonSignal(events, {
  nowMs = Date.now(),
  inputWindowSha256 = null,
  dataManifestSha256 = null,
  providerFetchMode = 'direct-current-provider-fetch-v1',
  minimumHistoryBars = 120,
  maxLagMinutes = null,
} = {}) {
  const freshness = assessShortHorizonFreshness(events, {
    nowMs,
    minimumHistoryBars,
    maxLagMinutes,
  });

  if (!freshness.fresh) {
    return {
      version:SHORT_HORIZON_PROSPECTIVE_SIGNAL_RUNNER_VERSION,
      status:'SKIPPED',
      reason:freshness.reason,
      freshness,
      record:null,
    };
  }

  const analysis = analyzeShortHorizonHumanCanon(events);
  const latestMarketEvent = [...events]
    .sort((a, b) => Number(a.sourceTimestampMs) - Number(b.sourceTimestampMs))
    .at(-1);

  let record = buildShortHorizonSignalRecord({
    analysis,
    latestMarketEvent,
    generatedAtMs:Number(nowMs),
    observationMode:'prospective',
    dataManifestSha256,
  });

  record.provenance = {
    ...record.provenance,
    inputWindowSha256:inputWindowSha256 || null,
    providerFetchMode,
    runnerVersion:SHORT_HORIZON_PROSPECTIVE_SIGNAL_RUNNER_VERSION,
  };
  record.observationContext = {
    freshness:clone(freshness),
  };
  record = attachTimeContextToSignal(record, buildShortHorizonTimeContext(
    latestMarketEvent.sourceTimestampMs,
    { assetClass:latestMarketEvent.assetClass },
  ));
  validateShortHorizonSignalRecord(record);

  return {
    version:SHORT_HORIZON_PROSPECTIVE_SIGNAL_RUNNER_VERSION,
    status:'RECORDED',
    reason:null,
    freshness,
    analysis,
    record,
  };
}
