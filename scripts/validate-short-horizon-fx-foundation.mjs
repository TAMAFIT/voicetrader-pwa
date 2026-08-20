import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const errors = [];
const need = (condition, code) => { if (!condition) errors.push(code); };

const required = [
  'src/short-horizon/dukascopy-fx.js',
  'scripts/collect-short-horizon-fx.mjs',
  'scripts/test-short-horizon-dukascopy-fx.mjs',
  'scripts/test-short-horizon-fx-archive.mjs',
  '.github/workflows/short-horizon-fx-collector.yml',
  '.github/workflows/short-horizon-crypto-collector.yml',
  'scripts/lib/short-horizon-archive.mjs',
];
for (const file of required) need(fs.existsSync(file), `missing:${file}`);

const provider = read('src/short-horizon/dukascopy-fx.js');
need(provider.includes("instrument:'usdjpy'"), 'fx-usdjpy-source-missing');
need(provider.includes("priceType:'bid'"), 'fx-price-side-not-pinned');
need(provider.includes("timeframe:'m1'"), 'fx-source-timeframe-not-m1');
need(provider.includes("liveExecutionFeed:false"), 'fx-live-execution-feed-not-blocked');
need(provider.includes("DUKASCOPY_NODE_VERSION = '1.50.0'"), 'dukascopy-version-not-pinned-in-code');
need(provider.includes("expectedContinuity:'sessioned'"), 'fx-sessioned-continuity-missing');

const fxWorkflow = read('.github/workflows/short-horizon-fx-collector.yml');
const cryptoWorkflow = read('.github/workflows/short-horizon-crypto-collector.yml');
for (const workflow of [fxWorkflow, cryptoWorkflow]) {
  need(workflow.includes('group: short-horizon-data-writer'), 'data-writer-concurrency-not-shared');
}
need(fxWorkflow.includes('dukascopy-node@1.50.0'), 'dukascopy-runtime-version-not-pinned');
need(fxWorkflow.includes('--ignore-scripts'), 'dukascopy-install-scripts-not-disabled');
need(fxWorkflow.includes('--package-lock=false'), 'collector-may-mutate-package-lock');
need(fxWorkflow.includes('ref: short-horizon-data'), 'fx-data-branch-not-used');
need(fxWorkflow.includes('data/short-horizon/fx-manifest.json'), 'fx-manifest-not-bounded');
need(!fxWorkflow.includes('secrets.'), 'fx-collector-unexpected-secret-reference');

const collector = read('scripts/collect-short-horizon-fx.mjs');
need(collector.includes("manifestFile:'fx-manifest.json'"), 'fx-manifest-not-separated');
need(collector.includes('LOOKBACK_MS = 72'), 'fx-overlap-catchup-window-missing');

const archive = read('scripts/lib/short-horizon-archive.mjs');
need(archive.includes("assetClassDirectory(event.assetClass)"), 'archive-not-asset-class-routed');
need(archive.includes("continuityMode === 'continuous-24x7' ? continuousGapCount : null"), 'sessioned-gap-policy-missing');
need(archive.includes('market-data-conflict'), 'archive-conflict-fail-closed-missing');
need(archive.includes('realMoneyRouting: false'), 'real-money-guardrail-open');
need(archive.includes('orderSubmission: false'), 'order-submission-guardrail-open');

if (errors.length) {
  console.error(`Short-Horizon FX Foundation validation failed: ${errors.join(',')}`);
  process.exit(1);
}
console.log('Short-Horizon FX Foundation validation passed.');
