import assert from 'node:assert/strict';
import {evaluateLocalEdgeLabV084Health} from '../src/short-horizon/local-edge-lab-v084-health.js';

const now=1_000_000;
const safe={googleCloudEnabled:false,cloudUploadEnabled:false,githubActionsRequired:false};
const base={
  nowMs:now,maxAgeMs:90_000,
  krakenRaw:{status:'RUNNING',updatedAtMs:now-1000,counts:{messages:10},integrity:{bookChecksumVerified:true,bookSynchronizationVerified:true},semantics:{micropriceAvailable:true},runtimePolicy:safe},
  krakenWindows:{status:'RUNNING',updatedAtMs:now-1000,counts:{windowsWritten:4},semantics:{windowTimeBasis:'PROVIDER_TIMESTAMP'},runtimePolicy:safe},
  coinbaseRaw:{status:'RUNNING',updatedAtMs:now-1000,counts:{messages:10,trustedSnapshots:2},integrity:{orderBookSynchronizationVerified:true},semantics:{derivedFeaturesAvailable:true,predictionInputAuthorized:false},runtimePolicy:safe},
  coinbaseWindows:{status:'RUNNING',updatedAtMs:now-1000,counts:{windowsWritten:4},semantics:{windowTimeBasis:'PROVIDER_TIMESTAMP',predictionInputAuthorized:false},runtimePolicy:safe},
  crossVenueWorker:{updatedAtMs:now-1000,counts:{krakenWindowsRead:2,coinbaseWindowsRead:2,pairsWritten:0},runtimePolicy:safe},
  preregisteredWorker:{updatedAtMs:now-1000,governance:{predictionInputAuthorized:false,adaptiveLearningAuthorized:false},runtimePolicy:safe},
  learningScorecard:{generatedAtMs:now-1000,worker:{blindDirectoryRead:false},governance:{blindResultsConsumed:false,predictionInputAuthorized:false},runtimePolicy:safe},
};
const pass=evaluateLocalEdgeLabV084Health(base);assert.equal(pass.status,'PASS');assert.equal(pass.failedChecks.length,0);assert.equal(pass.governance.executionAuthorized,false);
const stale=evaluateLocalEdgeLabV084Health({...base,coinbaseRaw:{...base.coinbaseRaw,updatedAtMs:now-100_000}});assert.equal(stale.status,'BLOCKED');assert.ok(stale.failedChecks.includes('COINBASE_RAW_FRESH'));
const blindLeak=evaluateLocalEdgeLabV084Health({...base,learningScorecard:{...base.learningScorecard,worker:{blindDirectoryRead:true}}});assert.equal(blindLeak.status,'BLOCKED');assert.ok(blindLeak.failedChecks.includes('LEARNING_BLIND_NOT_READ'));
const cloud=evaluateLocalEdgeLabV084Health({...base,crossVenueWorker:{...base.crossVenueWorker,runtimePolicy:{...safe,cloudUploadEnabled:true}}});assert.equal(cloud.status,'BLOCKED');assert.ok(cloud.failedChecks.includes('CROSS_VENUE_CLOUD_SAFE'));
const noCoinbaseBook=evaluateLocalEdgeLabV084Health({...base,coinbaseRaw:{...base.coinbaseRaw,integrity:{orderBookSynchronizationVerified:false}}});assert.equal(noCoinbaseBook.status,'BLOCKED');assert.ok(noCoinbaseBook.failedChecks.includes('COINBASE_BOOK_SYNC'));
console.log('PASS v0.84 Local Edge Lab installation health gate');
