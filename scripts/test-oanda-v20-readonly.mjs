import assert from 'node:assert/strict';
import {
  assertOandaReadonlyTarget,
  createOandaV20ReadonlyClient,
  parseOandaPricingStreamLine,
} from '../src/short-horizon/oanda-v20-readonly.js';
import { validateShortHorizonExecutableQuote } from '../src/short-horizon/executable-quote-contract.js';

const ACCOUNT = '101-001-1234567-001';
const TOKEN = 'test-token-not-a-real-secret';
const SOURCE_TIME = '2026-08-20T14:00:00.000000000Z';
const SOURCE_MS = Date.parse('2026-08-20T14:00:00.000Z');
const RECEIVED_MS = SOURCE_MS + 123;

const clientPrice = {
  type:'PRICE',
  instrument:'USD_JPY',
  time:SOURCE_TIME,
  tradeable:true,
  bids:[
    { price:'158.599', liquidity:2_000_000 },
    { price:'158.600', liquidity:1_000_000 },
  ],
  asks:[
    { price:'158.609', liquidity:2_000_000 },
    { price:'158.608', liquidity:1_000_000 },
  ],
};

assert.equal(assertOandaReadonlyTarget({ method:'GET', path:`/v3/accounts/${ACCOUNT}/pricing` }), true);
assert.equal(assertOandaReadonlyTarget({ method:'GET', path:`/v3/accounts/${ACCOUNT}/pricing/stream` }), true);
assert.throws(() => assertOandaReadonlyTarget({ method:'POST', path:`/v3/accounts/${ACCOUNT}/pricing` }), /method-blocked/);
assert.throws(() => assertOandaReadonlyTarget({ method:'PUT', path:`/v3/accounts/${ACCOUNT}/pricing` }), /method-blocked/);
assert.throws(() => assertOandaReadonlyTarget({ method:'DELETE', path:`/v3/accounts/${ACCOUNT}/pricing` }), /method-blocked/);
assert.throws(() => assertOandaReadonlyTarget({ method:'GET', path:`/v3/accounts/${ACCOUNT}/orders` }), /path-blocked/);

const parsedQuote = parseOandaPricingStreamLine(JSON.stringify(clientPrice), {
  environment:'practice',
  receivedTimestampMs:RECEIVED_MS,
});
assert.equal(parsedQuote.type, 'QUOTE');
assert.equal(validateShortHorizonExecutableQuote(parsedQuote.quote), true);
assert.equal(parsedQuote.quote.quote.bid, 158.6);
assert.equal(parsedQuote.quote.quote.ask, 158.608);
assert.equal(parsedQuote.quote.quote.spreadPriceUnits, 0.008);
assert.equal(parsedQuote.quote.quote.spreadBps, 0.504401);
assert.equal(parsedQuote.quote.timing.receiveMinusSourceMs, 123);
assert.equal(parsedQuote.quote.observation.practiceQuoteObserved, true);
assert.equal(parsedQuote.quote.observation.liveExecutableQuoteObserved, false);
assert.equal(parsedQuote.quote.governance.orderSubmission, false);

const heartbeat = parseOandaPricingStreamLine(JSON.stringify({
  type:'HEARTBEAT',
  time:'2026-08-20T14:00:05.000000000Z',
}), { environment:'practice', receivedTimestampMs:SOURCE_MS + 5_100 });
assert.equal(heartbeat.type, 'HEARTBEAT');
assert.equal(heartbeat.environment, 'practice');
assert.equal(heartbeat.sourceTimestampMs, SOURCE_MS + 5_000);
assert.equal(parseOandaPricingStreamLine('   ', { environment:'practice' }), null);
assert.throws(() => parseOandaPricingStreamLine('{bad json', { environment:'practice' }), /stream-json-invalid/);

const calls = [];
let nowValue = RECEIVED_MS;
const encoder = new TextEncoder();
const streamPayload = `${JSON.stringify(clientPrice)}\n${JSON.stringify({ type:'HEARTBEAT', time:'2026-08-20T14:00:05.000000000Z' })}\n`;
const encoded = encoder.encode(streamPayload);
const streamChunks = [encoded.slice(0, 37), encoded.slice(37, 111), encoded.slice(111)];

const fetchImpl = async (url, options) => {
  calls.push({ url:String(url), options });
  if (String(url).includes('/pricing/stream')) {
    let index = 0;
    return {
      ok:true,
      status:200,
      body:{
        getReader() {
          return {
            async read() {
              if (index >= streamChunks.length) return { done:true, value:undefined };
              return { done:false, value:streamChunks[index++] };
            },
            releaseLock() {},
          };
        },
      },
    };
  }
  return {
    ok:true,
    status:200,
    async json() {
      return { prices:[clientPrice], time:SOURCE_TIME };
    },
  };
};

const client = createOandaV20ReadonlyClient({
  environment:'practice',
  accountId:ACCOUNT,
  token:TOKEN,
  fetchImpl,
  now:() => nowValue,
});
assert.equal(client.metadata.readOnly, true);
assert.deepEqual(client.metadata.allowedMethods, ['GET']);
assert.equal(client.metadata.orderSurfaceAvailable, false);
assert.equal(client.metadata.executionAuthorized, false);
assert.equal(client.metadata.orderSubmission, false);
assert.doesNotMatch(JSON.stringify(client.metadata), new RegExp(TOKEN));
assert.doesNotMatch(JSON.stringify(client.metadata), new RegExp(ACCOUNT));

const restQuote = await client.fetchCurrentUsdJpyQuote();
assert.equal(restQuote.provider.transport, 'REST_CURRENT_PRICING');
assert.equal(restQuote.quote.bid, 158.6);
assert.equal(restQuote.quote.ask, 158.608);
assert.equal(restQuote.observation.providerQuoteObserved, true);
assert.equal(restQuote.observation.practiceQuoteObserved, true);
assert.equal(restQuote.observation.fillObserved, false);
assert.equal(calls[0].options.method, 'GET');
assert.match(calls[0].url, /^https:\/\/api-fxpractice\.oanda\.com\/v3\/accounts\//);
assert.match(calls[0].url, /instruments=USD_JPY/);
assert.equal(calls[0].options.headers.Authorization, `Bearer ${TOKEN}`);

const streamUrl = client.pricingStreamUrl();
assert.match(streamUrl, /^https:\/\/stream-fxpractice\.oanda\.com\/v3\/accounts\//);
assert.match(streamUrl, /instruments=USD_JPY/);
assert.match(streamUrl, /snapshot=true/);
assert.doesNotMatch(streamUrl, new RegExp(TOKEN));

const observedQuotes = [];
const observedHeartbeats = [];
nowValue = SOURCE_MS + 200;
const streamSummary = await client.streamUsdJpyPrices({
  onQuote:(quote) => observedQuotes.push(quote),
  onHeartbeat:(event) => observedHeartbeats.push(event),
});
assert.equal(streamSummary.status, 'STREAM_ENDED');
assert.equal(streamSummary.quoteCount, 1);
assert.equal(streamSummary.heartbeatCount, 1);
assert.equal(streamSummary.executionAuthorized, false);
assert.equal(streamSummary.orderSubmission, false);
assert.equal(observedQuotes.length, 1);
assert.equal(observedHeartbeats.length, 1);
assert.equal(observedQuotes[0].provider.transport, 'PRICING_STREAM');
assert.equal(observedQuotes[0].governance.orderSubmission, false);
assert.equal(calls[1].options.method, 'GET');
assert.equal(calls[1].options.headers.Authorization, `Bearer ${TOKEN}`);

const failingClient = createOandaV20ReadonlyClient({
  environment:'practice',
  accountId:ACCOUNT,
  token:TOKEN,
  fetchImpl:async () => ({ ok:false, status:401 }),
});
await assert.rejects(() => failingClient.fetchCurrentUsdJpyQuote(), (error) => {
  assert.match(error.message, /oanda-readonly-http-401/);
  assert.doesNotMatch(error.message, new RegExp(TOKEN));
  return true;
});

console.log('OANDA v20 hard read-only adapter tests passed');
