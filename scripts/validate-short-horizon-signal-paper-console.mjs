import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const errors = [];
const need = (condition, code) => { if (!condition) errors.push(code); };

const remote = read('src/short-horizon/signal-paper-console-remote.js');
const ui = read('src/short-horizon/signal-paper-console-ui.js');
const css = read('short-horizon-signal-paper-console.css');
const pwa = read('src/pwa.js');
const sw = read('sw.js');

for (const marker of [
  'short-horizon-signal-paper-console-remote-v1',
  'short-horizon-signal-data',
  'short-horizon-gmo-quote-data',
  'short-horizon-gmo-paper-data',
  'method: \'GET\'',
  "cache: 'no-store'",
  'humanCanonFrozenBenchmark',
  'actualNetEvAvailable',
  'changesHumanCanonThresholds',
  'NO_CURRENT_FX_SIGNAL',
]) need(remote.includes(marker), `remote-marker-missing:${marker}`);

for (const forbidden of ["method: 'POST'", "method: 'PUT'", "method: 'PATCH'", "method: 'DELETE'", 'executionAuthorized:true', 'realMoneyRouting:true', 'orderSubmission:true']) {
  need(!remote.includes(forbidden), `remote-write-or-authority-marker:${forbidden}`);
}

need(!remote.includes('human-canon-engine.js'), 'console-must-not-import-human-canon-engine');
need(!remote.includes('prospective-signal-runner.js'), 'console-must-not-import-signal-runner');
need(!remote.includes('gmo-paper-execution.js'), 'console-must-not-import-paper-execution-runtime');

for (const marker of [
  'USDJPY Signal / GMO Paper Console',
  'Last recorded / FROZEN',
  'この過去シグナルを現在シグナルとして扱いません',
  'actualNetEvAvailable=false',
  'profitabilityClaim=false',
  'SIMULATED_EXECUTED',
  'NO_TRADE',
  'setupShortHorizonSignalPaperConsoleUI',
]) need(ui.includes(marker), `ui-marker-missing:${marker}`);

need(!ui.includes('executionAuthorized=true'), 'ui-must-not-claim-execution-authority');
need(!ui.includes('profitabilityClaim=true'), 'ui-must-not-claim-profitability');

for (const marker of ['.short-horizon-console', '.short-horizon-console-grid', '.short-horizon-paper-row', '@media(max-width:760px)']) {
  need(css.includes(marker), `css-marker-missing:${marker}`);
}

for (const marker of [
  "import { setupShortHorizonSignalPaperConsoleUI } from './short-horizon/signal-paper-console-ui.js';",
  'setupShortHorizonSignalPaperConsoleUI();',
]) need(pwa.includes(marker), `pwa-wiring-missing:${marker}`);

for (const file of [
  './short-horizon-signal-paper-console.css',
  './src/short-horizon/signal-paper-console-remote.js',
  './src/short-horizon/signal-paper-console-ui.js',
]) need(sw.includes(file), `service-worker-cache-missing:${file}`);

need(sw.includes('v0.49-signal-paper-console'), 'service-worker-cache-version-missing-v049');

if (errors.length) {
  console.error(`Short-Horizon Signal/Paper Console v0.49 validation failed: ${errors.join(',')}`);
  process.exit(1);
}
console.log('Short-Horizon Signal/Paper Console v0.49 validation passed.');
