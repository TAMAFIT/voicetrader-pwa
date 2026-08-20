import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');

const contract = read('src/short-horizon/cost-break-even.js');
const archive = read('scripts/lib/short-horizon-cost-analysis-archive.mjs');
const collector = read('scripts/collect-short-horizon-cost-analysis.mjs');
const workflow = read('.github/workflows/short-horizon-cost-analysis-collector.yml');

assert.match(contract, /SHORT_HORIZON_COST_BREAK_EVEN_VERSION = 'short-horizon-cost-break-even-v1'/);
assert.match(contract, /grossDirectionalReturnBps/);
assert.match(contract, /breakEvenRoundTripCostBps/);
assert.match(contract, /positiveCostBudgetExists/);
assert.match(contract, /costBindingStatus:'UNBOUND'/);
assert.match(contract, /actualRoundTripCostBps:null/);
assert.match(contract, /netReturnAvailable:false/);
assert.match(contract, /netReturnPct:null/);
assert.match(contract, /transactionCostsModeled:false/);
assert.match(contract, /providerCostClaim:false/);
assert.match(contract, /changesHumanCanonThresholds:false/);
assert.match(contract, /optimizer:false/);

assert.match(archive, /branch:'short-horizon-cost-analysis-data'/);
assert.match(archive, /sourceOutcomesBranch:'short-horizon-outcome-data'/);
assert.match(archive, /breakEvenFromGrossOutcomeOnly:true/);
assert.match(archive, /providerCostBinding:false/);
assert.match(archive, /arbitraryCostScenarioGrid:false/);
assert.match(archive, /netReturnAvailable:false/);
assert.match(archive, /positiveCostBudgetRate/);
assert.match(archive, /medianBreakEvenRoundTripCostBps/);

assert.match(collector, /readOutcomeArchiveRecords/);
assert.match(collector, /buildShortHorizonCostBreakEvenRecord/);
assert.match(collector, /outcomeRecordSha256/);
assert.doesNotMatch(collector, /fetchKrakenOhlcStream/);
assert.doesNotMatch(collector, /fetchUsdJpyShortHorizon/);

assert.match(workflow, /cron: '12,27,42,57 \* \* \* \*'/);
assert.match(workflow, /ref: short-horizon-outcome-data/);
assert.match(workflow, /ref: short-horizon-cost-analysis-data/);
assert.match(workflow, /group: short-horizon-cost-analysis-data-writer/);
assert.doesNotMatch(workflow, /git push origin HEAD:short-horizon-outcome-data/);
assert.match(workflow, /git push origin HEAD:short-horizon-cost-analysis-data/);

for (const text of [contract, archive, collector, workflow]) {
  assert.doesNotMatch(text, /executionAuthorized\s*[:=]\s*true/);
  assert.doesNotMatch(text, /realMoneyRouting\s*[:=]\s*true/);
  assert.doesNotMatch(text, /orderSubmission\s*[:=]\s*true/);
  assert.doesNotMatch(text, /automaticPromotion\s*[:=]\s*true/);
  assert.doesNotMatch(text, /profitabilityClaim\s*[:=]\s*true/);
  assert.doesNotMatch(text, /providerCostClaim\s*[:=]\s*true/);
  assert.doesNotMatch(text, /netReturnAvailable\s*[:=]\s*true/);
}

console.log('v0.45 short-horizon cost analysis validation passed');
