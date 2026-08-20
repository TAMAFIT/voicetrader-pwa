import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OANDA_JAPAN_NY_PRO_REST_V1 } from '../src/short-horizon/deployability-registry.js';
import { assertOandaReadonlyTarget } from '../src/short-horizon/oanda-v20-readonly.js';

const adapterSource = fs.readFileSync(new URL('../src/short-horizon/oanda-v20-readonly.js', import.meta.url), 'utf8');
const quoteSource = fs.readFileSync(new URL('../src/short-horizon/executable-quote-contract.js', import.meta.url), 'utf8');

assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.eligibility.operatorEligibilityStatus, 'UNVERIFIED');
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.governance.apiEligibilityVerified, false);
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.governance.executionAuthorized, false);
assert.equal(OANDA_JAPAN_NY_PRO_REST_V1.governance.orderSubmission, false);

assert.equal(assertOandaReadonlyTarget({ method:'GET', path:'/v3/accounts/test/pricing' }), true);
assert.equal(assertOandaReadonlyTarget({ method:'GET', path:'/v3/accounts/test/pricing/stream' }), true);
for (const method of ['POST','PUT','PATCH','DELETE']) {
  assert.throws(() => assertOandaReadonlyTarget({ method, path:'/v3/accounts/test/pricing' }), /method-blocked/);
}
for (const path of [
  '/v3/accounts/test/orders',
  '/v3/accounts/test/trades',
  '/v3/accounts/test/positions/USD_JPY/close',
  '/v3/accounts/test/summary',
]) {
  assert.throws(() => assertOandaReadonlyTarget({ method:'GET', path }), /path-blocked/);
}

assert.doesNotMatch(adapterSource, /process\.env/);
assert.doesNotMatch(adapterSource, /method\s*:\s*['"]POST['"]/);
assert.doesNotMatch(adapterSource, /method\s*:\s*['"]PUT['"]/);
assert.doesNotMatch(adapterSource, /method\s*:\s*['"]PATCH['"]/);
assert.doesNotMatch(adapterSource, /method\s*:\s*['"]DELETE['"]/);
assert.doesNotMatch(adapterSource, /\/orders\?/, 'adapter must not build an order endpoint URL');
assert.match(adapterSource, /orderSurfaceAvailable:false/);
assert.match(adapterSource, /executionAuthorized:false/);
assert.match(adapterSource, /realMoneyRouting:false/);
assert.match(adapterSource, /orderSubmission:false/);
assert.match(adapterSource, /IN_MEMORY_BEARER_TOKEN/);
assert.match(adapterSource, /tokenStoredOnMetadata:false/);

assert.match(quoteSource, /providerQuoteObserved:true/);
assert.match(quoteSource, /fillObserved:false/);
assert.match(quoteSource, /slippageObserved:false/);
assert.match(quoteSource, /roundTripCostObserved:false/);
assert.match(quoteSource, /netReturnAvailable:false/);
assert.match(quoteSource, /readOnlyObservation:true/);
assert.match(quoteSource, /executionAuthorized:false/);
assert.match(quoteSource, /orderSubmission:false/);

const workflowFiles = fs.readdirSync(new URL('../.github/workflows/', import.meta.url));
const authenticatedOandaCollectors = workflowFiles.filter((name) => /oanda.*(quote|pricing|readonly).*collector/i.test(name));
assert.deepEqual(authenticatedOandaCollectors, [], 'v0.47 must not add a scheduled authenticated OANDA collector before Secret/account boundary');

console.log('OANDA v20 read-only adapter guardrails passed');
