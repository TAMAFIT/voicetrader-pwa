import assert from 'node:assert/strict';
import { KrakenBookIntegrityTracker } from '../src/short-horizon/kraken-book-integrity.js';

// Official Kraken WebSocket v2 checksum example.
const snapshot={
  channel:'book',type:'snapshot',data:[{
    symbol:'BTC/USD',
    bids:[
      {price:'45283.5',qty:'0.10000000'},{price:'45283.4',qty:'1.54582015'},
      {price:'45282.1',qty:'0.10000000'},{price:'45281.0',qty:'0.10000000'},
      {price:'45280.3',qty:'1.54592586'},{price:'45279.0',qty:'0.07990000'},
      {price:'45277.6',qty:'0.03310103'},{price:'45277.5',qty:'0.30000000'},
      {price:'45277.3',qty:'1.54602737'},{price:'45276.6',qty:'0.15445238'},
    ],
    asks:[
      {price:'45285.2',qty:'0.00100000'},{price:'45286.4',qty:'1.54571953'},
      {price:'45286.6',qty:'1.54571109'},{price:'45289.6',qty:'1.54560911'},
      {price:'45290.2',qty:'0.15890660'},{price:'45291.8',qty:'1.54553491'},
      {price:'45294.7',qty:'0.04454749'},{price:'45296.1',qty:'0.35380000'},
      {price:'45297.5',qty:'0.09945542'},{price:'45299.5',qty:'0.18772827'},
    ],
    checksum:3310070434,
  }],
};
const tracker=new KrakenBookIntegrityTracker({depth:10});
const evidence=tracker.applyRawMessage(JSON.stringify(snapshot),{sequence:1,receivedTimestampMs:1,sourceSha256:'official-example'});
assert.equal(evidence.length,1);
assert.equal(evidence[0].providerChecksum,3310070434);
assert.equal(evidence[0].localChecksum,3310070434);
assert.equal(evidence[0].status,'MATCH');
assert.equal(evidence[0].trustedAfter,true);
assert.equal(evidence[0].semantics.bookSynchronizationVerified,true);
assert.equal(evidence[0].semantics.ofiAuthorized,false);
assert.equal(evidence[0].runtimePolicy.googleCloudEnabled,false);

const bad=structuredClone(snapshot);
bad.data[0].checksum=1;
const badTracker=new KrakenBookIntegrityTracker({depth:10});
const badEvidence=badTracker.applyRawMessage(JSON.stringify(bad),{sequence:1,receivedTimestampMs:1});
assert.equal(badEvidence[0].status,'MISMATCH');
assert.equal(badEvidence[0].trustedAfter,false);

console.log('PASS v0.52 Kraken official CRC32 checksum example');
