import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fail = message => {
  console.error(`Live Forward validation failed: ${message}`);
  process.exitCode = 1;
};

const required = [
  'live-forward.css',
  'src/live/live-forward-paper.js',
  'src/live/live-forward-store.js',
  'src/live/live-forward-ui.js',
  'scripts/test-live-forward.mjs',
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) fail(`missing required file: ${file}`);
}

const pwa = fs.readFileSync(path.join(root, 'src/pwa.js'), 'utf8');
for (const marker of ['setupLiveForwardTradingUI', './live/live-forward-ui.js']) {
  if (!pwa.includes(marker)) fail(`pwa bootstrap missing marker: ${marker}`);
}

const paper = fs.readFileSync(path.join(root, 'src/live/live-forward-paper.js'), 'utf8');
for (const marker of [
  'LIVE_FORWARD_VERSION',
  'processLiveForwardSnapshot',
  'exactOnceByCandleTimestamp: true',
  'catchUpEnabled: true',
  'fixedExitHorizonBars',
  'noReentryOnExitCandle: true',
  'deterministicExpectedRoundTripCost: true',
  'realMoneyRouting: false',
  'forwardEvidenceCoupled: false',
  'automaticPromotion: false',
  'frozen-runtime-version-mismatch',
  'closed-candle-continuity-gap',
]) {
  if (!paper.includes(marker)) fail(`live-forward-paper missing guardrail marker: ${marker}`);
}
if (paper.includes('ForwardEvidenceStore') || paper.includes('forward-evidence-store')) {
  fail('live-forward-paper must not couple to Forward Evidence storage');
}

const store = fs.readFileSync(path.join(root, 'src/live/live-forward-store.js'), 'utf8');
for (const marker of ['LIVE_FORWARD_STORAGE_KEY', 'voicetrader-live-forward-paper-v0.10', 'LiveForwardStore']) {
  if (!store.includes(marker)) fail(`live-forward-store missing marker: ${marker}`);
}
if (store.includes('ForwardEvidenceStore') || store.includes('forward-evidence-store')) {
  fail('live-forward-store must not couple to Forward Evidence storage');
}

const ui = fs.readFileSync(path.join(root, 'src/live/live-forward-ui.js'), 'utf8');
for (const marker of [
  'Live Forward Paper Trading',
  '実市場の新しい4H足で自動デモ売買',
  'LIVE_FORWARD_POLL_MS',
  '2 * 60 * 1000',
  'loadBTCUSD4H',
  'processLiveForwardSnapshot',
  '今すぐ同期',
  'ブラウザOpen中',
  '実注文',
]) {
  if (!ui.includes(marker)) fail(`live-forward-ui missing marker: ${marker}`);
}

const css = fs.readFileSync(path.join(root, 'live-forward.css'), 'utf8');
for (const marker of ['.live-forward-card', '.live-forward-status.running', '.live-forward-kpis', '@media (max-width:600px)']) {
  if (!css.includes(marker)) fail(`live-forward.css missing marker: ${marker}`);
}

const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
for (const marker of [
  'v0.10-live-forward',
  './live-forward.css',
  './src/live/live-forward-paper.js',
  './src/live/live-forward-store.js',
  './src/live/live-forward-ui.js',
]) {
  if (!sw.includes(marker)) fail(`service worker missing live-forward cache marker: ${marker}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const [major, minor] = String(pkg.version || '').split('.').map(Number);
if (!(major === 0 && Number.isFinite(minor) && minor >= 10)) {
  fail(`package version must preserve v0.10+ Live Forward contract, got ${pkg.version}`);
}
if (!pkg.scripts?.test?.includes('test-live-forward.mjs')) fail('npm test does not run live-forward regression tests');

if (!process.exitCode) console.log(`Live Forward v0.10 contract integrity validation passed under package ${pkg.version}.`);
