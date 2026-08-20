import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');

const session = read('src/short-horizon/session-context.js');
const freshness = read('src/short-horizon/freshness-gate.js');
const runner = read('src/short-horizon/prospective-signal-runner.js');
const fx = read('src/short-horizon/dukascopy-fx.js');
const collector = read('scripts/collect-short-horizon-signals.mjs');
const archive = read('scripts/lib/short-horizon-signal-archive.mjs');
const workflow = read('.github/workflows/short-horizon-prospective-signal-collector.yml');

assert.match(session, /dstHandledByIanaTimeZones:true/);
assert.match(session, /centralizedExchangeOpenClaim:false/);
assert.match(session, /Asia\/Tokyo/);
assert.match(session, /Europe\/London/);
assert.match(session, /America\/New_York/);

assert.match(freshness, /status:'STALE'/);
assert.match(freshness, /status:'INSUFFICIENT_HISTORY'/);
assert.match(runner, /SHORT_HORIZON_PROSPECTIVE_ANALYSIS_WINDOW_BARS = 160/);
assert.match(runner, /observationMode:'prospective'/);
assert.match(runner, /providerFetchMode/);
assert.match(runner, /fixedAnalysisWindowBars/);

assert.match(fx, /ignoreFlats = true/);
assert.match(collector, /ignoreFlats:false/);
assert.match(collector, /FX_LOOKBACK_HOURS = 72/);
assert.match(collector, /fetchKrakenOhlcStream/);
assert.match(collector, /fetchUsdJpyShortHorizon/);
assert.match(collector, /buildProspectiveShortHorizonSignal/);

assert.match(archive, /branch:'short-horizon-signal-data'/);
assert.match(archive, /prospectiveOnly:true/);
assert.match(archive, /outcomesStoredSeparately:true/);
assert.match(archive, /executionAuthorized:false/);
assert.match(archive, /realMoneyRouting:false/);
assert.match(archive, /orderSubmission:false/);

assert.match(workflow, /cron: '2,17,32,47 \* \* \* \*'/);
assert.match(workflow, /ref: short-horizon-signal-data/);
assert.match(workflow, /group: short-horizon-signal-data-writer/);
assert.match(workflow, /dukascopy-node@1\.50\.0/);
assert.match(workflow, /--ignore-scripts/);
assert.doesNotMatch(workflow, /short-horizon-data-writer/);

for (const text of [session, freshness, runner, collector, archive, workflow]) {
  assert.doesNotMatch(text, /realMoneyRouting\s*[:=]\s*true/);
  assert.doesNotMatch(text, /orderSubmission\s*[:=]\s*true/);
  assert.doesNotMatch(text, /executionAuthorized\s*[:=]\s*true/);
}

console.log('v0.43 short-horizon prospective signal validation passed');
