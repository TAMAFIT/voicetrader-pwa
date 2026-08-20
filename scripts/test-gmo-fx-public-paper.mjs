import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildGmoFxTickerSubscription, buildGmoFxPublicQuote, GMO_FX_PUBLIC_WS_URL } from '../src/short-horizon/gmo-fx-public-quote.js';
import { buildGmoFxPaperExecution } from '../src/short-horizon/gmo-paper-execution.js';
import { mergeGmoQuotesIntoArchive, readGmoQuoteArchive, writeGmoQuoteManifest } from './lib/short-horizon-gmo-quote-archive.mjs';
import { mergeGmoPaperIntoArchive, readGmoPaperArchive, writeGmoPaperManifest } from './lib/short-horizon-gmo-paper-archive.mjs';

assert.equal(GMO_FX_PUBLIC_WS_URL,'wss://forex-api.coin.z.com/ws/public/v1');
assert.deepEqual(buildGmoFxTickerSubscription(),{command:'subscribe',channel:'ticker',symbol:'USD_JPY'});
assert.throws(()=>buildGmoFxTickerSubscription('EUR_USD'),/unsupported/);

const t0=Date.UTC(2026,7,20,14,0,0);
const q1=buildGmoFxPublicQuote({symbol:'USD_JPY',ask:'158.900',bid:'158.892',timestamp:new Date(t0).toISOString(),status:'OPEN'},{receivedTimestampMs:t0+120});
assert.equal(q1.provider.authenticationRequired,false);
assert.equal(q1.provider.accountSpecificPricing,false);
assert.equal(q1.quote.ask,158.9);
assert.equal(q1.quote.bid,158.892);
assert.ok(q1.quote.spreadBps>0);
assert.equal(q1.observation.fillObserved,false);
const q2=buildGmoFxPublicQuote({symbol:'USD_JPY',ask:'158.930',bid:'158.922',timestamp:new Date(t0+5*60_000).toISOString(),status:'OPEN'},{receivedTimestampMs:t0+5*60_000+90});
const q3=buildGmoFxPublicQuote({symbol:'USD_JPY',ask:'158.950',bid:'158.942',timestamp:new Date(t0+10*60_000).toISOString(),status:'OPEN'},{receivedTimestampMs:t0+10*60_000+70});
assert.throws(()=>buildGmoFxPublicQuote({symbol:'USD_JPY',ask:'1',bid:'2',timestamp:new Date(t0).toISOString(),status:'OPEN'}),/spread-invalid/);

const signal={
  schemaVersion:'short-horizon-signal-v1',signalId:'signal-usdjpy-long',observationMode:'prospective',observedProspectively:true,futureOutcomeUsed:false,generatedAtMs:t0-30_000,decisionBarCloseTimestampMs:t0-60_000,
  market:{assetClass:'fx',instrument:'USDJPY',venue:'dukascopy',timeframeMinutes:1,sourceTimestampMs:t0-120_000,sourceReceivedTimestampMs:t0-100_000,close:158.88,sourceId:'x',sourceEventId:'y'},
  decision:{signal:'LONG',intendedHorizonMinutes:5,secondaryHorizonMinutes:15,confidenceIsCalibratedProbability:false,scoreIsExpectedReturn:false},
  provenance:{},governance:{executionAuthorized:false,realMoneyRouting:false,orderSubmission:false}
};
const paper=buildGmoFxPaperExecution({signal,horizonKind:'primary',horizonMinutes:5,entryQuote:q1,exitQuote:q2,evaluatedAtMs:t0+6*60_000});
assert.equal(paper.status,'SIMULATED_EXECUTED');
assert.equal(paper.entry.side,'BUY_AT_ASK');
assert.equal(paper.exit.side,'SELL_AT_BID');
assert.equal(paper.result.quotedSpreadEmbedded,true);
assert.equal(paper.result.actualNetEvAvailable,false);
assert.equal(paper.governance.executionAuthorized,false);
const waitSignal=structuredClone(signal);waitSignal.signalId='signal-usdjpy-wait';waitSignal.decision.signal='WAIT';
const wait=buildGmoFxPaperExecution({signal:waitSignal,horizonKind:'primary',horizonMinutes:5,evaluatedAtMs:t0});
assert.equal(wait.status,'NO_TRADE');assert.equal(wait.entry,null);assert.equal(wait.result.quotedRoundTripReturnBps,null);

const quoteRoot=fs.mkdtempSync(path.join(os.tmpdir(),'gmo-quotes-'));const paperRoot=fs.mkdtempSync(path.join(os.tmpdir(),'gmo-paper-'));
try{
  let summary=mergeGmoQuotesIntoArchive({rootDir:quoteRoot,records:[q1,q2,q3]});assert.equal(summary.added,3);
  const retry=structuredClone(q1);retry.timing.receivedTimestampMs+=999;retry.timing.receiveMinusSourceMs+=999;summary=mergeGmoQuotesIntoArchive({rootDir:quoteRoot,records:[retry]});assert.equal(summary.duplicates,1);
  const conflict=structuredClone(q1);conflict.quote.ask+=0.001;assert.throws(()=>mergeGmoQuotesIntoArchive({rootDir:quoteRoot,records:[conflict]}),/immutability-conflict/);
  assert.equal(readGmoQuoteArchive(quoteRoot).records.length,3);
  const qm=writeGmoQuoteManifest({rootDir:quoteRoot,lastRun:{status:'success'}});assert.equal(qm.archive.recordCount,3);assert.equal(qm.guardrails.executionAuthorized,false);

  let pm=mergeGmoPaperIntoArchive({rootDir:paperRoot,records:[paper,wait]});assert.equal(pm.added,2);
  const paperRetry=structuredClone(paper);paperRetry.evaluatedAtMs+=1000;pm=mergeGmoPaperIntoArchive({rootDir:paperRoot,records:[paperRetry]});assert.equal(pm.duplicates,1);
  assert.equal(readGmoPaperArchive(paperRoot).records.length,2);
  const manifest=writeGmoPaperManifest({rootDir:paperRoot,lastRun:{status:'success'}});assert.equal(manifest.archive.directionalCount,1);assert.equal(manifest.archive.waitCount,1);assert.equal(manifest.methodology.sideCorrectBidAsk,true);assert.equal(manifest.methodology.actualNetEvAvailable,false);
}finally{fs.rmSync(quoteRoot,{recursive:true,force:true});fs.rmSync(paperRoot,{recursive:true,force:true});}
console.log('GMO FX public quote and paper execution tests passed');
