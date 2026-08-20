import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  OANDA_JAPAN_NY_PRO_REST_V1,
  validateShortHorizonDeployabilityProvider,
} from '../src/short-horizon/deployability-registry.js';

assert.equal(validateShortHorizonDeployabilityProvider(OANDA_JAPAN_NY_PRO_REST_V1), true);
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.evidence.officialOnly, true);
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.evidence.mutableProviderFacts, true);
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.eligibility.operatorEligibilityStatus, 'UNVERIFIED');
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.governance.accountOwnershipVerified, false);
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.governance.apiEligibilityVerified, false);
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.governance.credentialsPresent, false);
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.governance.providerConnectionAttempted, false);
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.governance.executableQuoteObserved, false);
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.governance.providerCostBinding, false);
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.governance.executionAuthorized, false);
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.governance.realMoneyRouting, false);
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.governance.orderSubmission, false);
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.governance.profitabilityClaim, false);
assert.ok(OANDA_JAPAN_NY_PRO_REST_V1.evidence.references.every((url) => url.startsWith('https://')));

const assessmentSource = fs.readFileSync(new URL('../src/short-horizon/reference-cost-binding.js', import.meta.url), 'utf8');
assert.match(assessmentSource, /PUBLISHED_REFERENCE_ONLY/);
assert.match(assessmentSource, /actualRoundTripCostBps:null/);
assert.match(assessmentSource, /sourceMarketMatchesExecutionVenue:false/);
assert.match(assessmentSource, /quoteVenueMismatch:true/);
assert.match(assessmentSource, /slippageModeled:false/);
assert.match(assessmentSource, /financingOrSwapModeled:false/);
assert.match(assessmentSource, /executionFillModeled:false/);
assert.match(assessmentSource, /netReturnAvailable:false/);
assert.match(assessmentSource, /providerConnectionAttempted:false/);
assert.match(assessmentSource, /credentialsPresent:false/);
assert.match(assessmentSource, /executionAuthorized:false/);
assert.match(assessmentSource, /realMoneyRouting:false/);
assert.match(assessmentSource, /orderSubmission:false/);
assert.match(assessmentSource, /profitabilityClaim:false/);

const collectorSource = fs.readFileSync(new URL('./collect-short-horizon-deployability.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(collectorSource, /Authorization\s*:/i);
assert.doesNotMatch(collectorSource, /process\.env\.(OANDA|API|TOKEN|SECRET)/i);
assert.doesNotMatch(collectorSource, /fetch\s*\(/);

const workflowSource = fs.readFileSync(new URL('../.github/workflows/short-horizon-deployability-collector.yml', import.meta.url), 'utf8');
assert.match(workflowSource, /short-horizon-outcome-data/);
assert.match(workflowSource, /short-horizon-cost-analysis-data/);
assert.match(workflowSource, /short-horizon-deployability-data/);
assert.doesNotMatch(workflowSource, /secrets\./);

console.log('short-horizon deployability guardrails passed');
