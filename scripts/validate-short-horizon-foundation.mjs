import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const errors = [];
const need = (condition, code) => { if (!condition) errors.push(code); };

const required = [
  'docs/SHORT_HORIZON_EXPANSION.md',
  'src/short-horizon/market-event.js',
  'src/short-horizon/kraken-ohlc.js',
  'scripts/lib/short-horizon-archive.mjs',
  'scripts/collect-short-horizon-crypto.mjs',
  'scripts/test-short-horizon-market-event.mjs',
  'scripts/test-short-horizon-kraken-ohlc.mjs',
  'scripts/test-short-horizon-archive.mjs',
  '.github/workflows/short-horizon-crypto-collector.yml',
  '.github/workflows/v040-short-horizon-ci.yml',
];
for (const file of required) need(fs.existsSync(file), `missing:${file}`);

const contract = read('docs/SHORT_HORIZON_EXPANSION.md');
need(contract.includes('short-horizon-data'), 'contract-data-branch-missing');
need(contract.includes('real-money'), 'contract-real-money-guardrail-missing');
need(contract.includes('fail-closed'), 'contract-conflict-guardrail-missing');

const collectorWorkflow = read('.github/workflows/short-horizon-crypto-collector.yml');
need(collectorWorkflow.includes('ref: short-horizon-data'), 'collector-does-not-checkout-data-branch');
need(collectorWorkflow.includes('git add -- data/short-horizon'), 'collector-git-scope-not-bounded');
need(collectorWorkflow.includes('node scripts/collect-short-horizon-crypto.mjs'), 'collector-script-not-wired');
need(!collectorWorkflow.includes('secrets.'), 'collector-unexpected-secret-reference');

const archive = read('scripts/lib/short-horizon-archive.mjs');
need(archive.includes('market-data-conflict'), 'archive-conflict-fail-closed-missing');
need(archive.includes('contentSha256'), 'archive-integrity-hash-missing');
need(archive.includes("realMoneyRouting: false"), 'archive-real-money-guardrail-open');
need(archive.includes("orderSubmission: false"), 'archive-order-submission-guardrail-open');

const provider = read('src/short-horizon/kraken-ohlc.js');
for (const marker of ['BTCUSD-1m','BTCUSD-5m','ETHUSD-1m','ETHUSD-5m']) need(provider.includes(marker), `stream-missing:${marker}`);
need(provider.includes('sourceTimestampMs + intervalMs > nowMs'), 'closed-candle-filter-missing');

if (errors.length) {
  console.error(`Short-Horizon Foundation validation failed: ${errors.join(',')}`);
  process.exit(1);
}
console.log('Short-Horizon Foundation validation passed.');
