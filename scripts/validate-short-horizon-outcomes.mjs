import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');

const contract = read('src/short-horizon/outcome-contract.js');
const signalReader = read('scripts/lib/short-horizon-signal-reader.mjs');
const archive = read('scripts/lib/short-horizon-outcome-archive.mjs');
const collector = read('scripts/collect-short-horizon-outcomes.mjs');
const workflow = read('.github/workflows/short-horizon-outcome-collector.yml');

assert.match(contract, /SHORT_HORIZON_OUTCOME_VERSION = 'short-horizon-outcome-v1'/);
assert.match(contract, /status:'PENDING_TIME'/);
assert.match(contract, /status:'MISSING_DATA'/);
assert.match(contract, /status:'MATURED'/);
assert.match(contract, /exactAlignedClosedBars:true/);
assert.match(contract, /transactionCostsModeled:false/);
assert.match(contract, /netReturnPct:null/);
assert.match(contract, /executionFillModeled:false/);
assert.match(contract, /mutatesSignalRecord:false/);
assert.match(contract, /usedByDecisionEngine:false/);
assert.match(contract, /futureOutcomeUsedForSignal:false/);

assert.match(signalReader, /observationMode !== 'prospective'/);
assert.match(signalReader, /signal-reader-duplicate-id/);
assert.match(archive, /branch:'short-horizon-outcome-data'/);
assert.match(archive, /sourceSignalsBranch:'short-horizon-signal-data'/);
assert.match(archive, /outcomesSeparateFromSignals:true/);
assert.match(archive, /unresolvedMissingDataNotFrozenAsOutcome:true/);
assert.match(archive, /transactionCostsModeled:false/);
assert.match(archive, /netReturnAvailable:false/);

assert.match(collector, /HORIZON_KINDS = Object.freeze\(\['primary', 'secondary'\]\)/);
assert.match(collector, /fetchKrakenOhlcStream/);
assert.match(collector, /fetchUsdJpyShortHorizon/);
assert.match(collector, /ignoreFlats:false/);
assert.match(collector, /evaluateShortHorizonOutcome/);
assert.match(collector, /futureWindowSha256/);
assert.match(collector, /signalRecordSha256/);
assert.match(collector, /providerUnavailable/);
assert.match(collector, /missingData/);

assert.match(workflow, /cron: '7,22,37,52 \* \* \* \*'/);
assert.match(workflow, /ref: short-horizon-signal-data/);
assert.match(workflow, /ref: short-horizon-outcome-data/);
assert.match(workflow, /group: short-horizon-outcome-data-writer/);
assert.match(workflow, /dukascopy-node@1\.50\.0/);
assert.match(workflow, /--ignore-scripts/);
assert.doesNotMatch(workflow, /git push origin HEAD:short-horizon-signal-data/);
assert.match(workflow, /git push origin HEAD:short-horizon-outcome-data/);

for (const text of [contract, signalReader, archive, collector, workflow]) {
  assert.doesNotMatch(text, /executionAuthorized\s*[:=]\s*true/);
  assert.doesNotMatch(text, /realMoneyRouting\s*[:=]\s*true/);
  assert.doesNotMatch(text, /orderSubmission\s*[:=]\s*true/);
  assert.doesNotMatch(text, /automaticPromotion\s*[:=]\s*true/);
  assert.doesNotMatch(text, /profitabilityClaim\s*[:=]\s*true/);
}

console.log('v0.44 short-horizon outcome validation passed');
